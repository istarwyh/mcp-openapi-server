/**
 * OpenAPI 解析模块 - 遵循SRP原则重构后的版本
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { OpenAPIV3 } from "openapi-types";
import { log } from "./logger.js";

// 类型守卫函数
function isDocument(obj: any): obj is OpenAPIV3.Document {
  return typeof obj === 'object' && 'openapi' in obj && 'info' in obj;
}

class ParameterProcessor {
  static createBaseSchema(): OpenAPIV3.SchemaObject {
    return {
      type: "object",
      properties: {},
      required: []
    };
  }

  static processRequestBody(
    requestBodySchema: OpenAPIV3.SchemaObject,
    inputSchema: OpenAPIV3.SchemaObject
  ) {
    if (!requestBodySchema.properties) return;

    // 复制所有属性
    for (const [propName, propSchema] of Object.entries(requestBodySchema.properties)) {
      if ('$ref' in propSchema) continue;

      // 直接复制属性定义
      inputSchema.properties![propName] = propSchema;

      // 如果属性是必需的，添加到 required 数组
      if (requestBodySchema.required?.includes(propName)) {
        if (!inputSchema.required) {
          inputSchema.required = [];
        }
        if (!inputSchema.required.includes(propName)) {
          inputSchema.required.push(propName);
        }
      }
    }
  }

  static processParameters(
    parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[],
    baseSchema: OpenAPIV3.SchemaObject
  ): OpenAPIV3.SchemaObject {
    for (const param of parameters) {
      if ('$ref' in param) continue;
      this.addParameterToSchema(param, baseSchema);
    }
    return baseSchema;
  }

  static addParameterToSchema(
    param: OpenAPIV3.ParameterObject,
    schema: OpenAPIV3.SchemaObject
  ) {
    if (!schema.properties) {
      schema.properties = {};
    }

    // 添加参数到 properties
    const paramSchema = param.schema;
    if (paramSchema && !('$ref' in paramSchema)) {
      const paramType = paramSchema.type || 'string';
      if (paramType === 'array') {
        schema.properties[param.name] = {
          type: 'array',
          description: param.description || `${param.name} parameter`,
        } as OpenAPIV3.ArraySchemaObject;
      } else {
        schema.properties[param.name] = {
          type: paramType as OpenAPIV3.NonArraySchemaObjectType,
          description: param.description || `${param.name} parameter`,
        };
      }
    }

    // 如果参数是必需的，添加到 required 数组
    if (param.required) {
      if (!schema.required) {
        schema.required = [];
      }
      if (!schema.required.includes(param.name)) {
        schema.required.push(param.name);
      }
    }
  }

  /**
   * 根据schema生成参数元数据
   */
  static createParametersMetadata(schema: OpenAPIV3.SchemaObject): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        if ('$ref' in prop) continue;
        
        parameters[name] = {
          type: prop.type || 'string',
          description: prop.description || `${name} parameter`,
          required: schema.required?.includes(name) || false
        };
      }
    }
    return parameters;
  }

  /**
   * 递归处理嵌套属性
   */
  private static processNestedProperties(
    parentName: string,
    parentSchema: OpenAPIV3.SchemaObject,
    inputSchema: OpenAPIV3.SchemaObject
  ) {
    if (!parentSchema.properties) return;

    for (const [childName, childSchema] of Object.entries(parentSchema.properties)) {
      if ('$ref' in childSchema) continue;

      const fullName = `${parentName}_${childName}`;
      const childType = childSchema.type || 'string';

      if (childType === 'array') {
        inputSchema.properties![fullName] = {
          type: 'array',
          description: childSchema.description || `${fullName} parameter`,
        } as OpenAPIV3.ArraySchemaObject;
      } else {
        inputSchema.properties![fullName] = {
          type: childType as OpenAPIV3.NonArraySchemaObjectType,
          description: childSchema.description || `${fullName} parameter`,
        };
      }

      // 递归处理多层嵌套
      if (childType === 'object' && childSchema.properties) {
        this.processNestedProperties(fullName, childSchema, inputSchema);
      }

      // 处理必填项
      if (parentSchema.required?.includes(childName)) {
        inputSchema.required!.push(fullName);
      }
    }
  }

  static cleanSchema(schema: OpenAPIV3.SchemaObject) {
    if (Object.keys(schema.properties || {}).length === 0) {
      delete schema.properties;
    }
    if ((schema.required || []).length === 0) {
      delete schema.required;
    }
  }
}

// 文件加载工具函数
async function loadSpecFile(filePath: string): Promise<OpenAPIV3.Document> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  log(`Loading OpenAPI spec from: ${resolvedPath}`);

  if (!existsSync(resolvedPath)) {
    throw new Error(`OpenAPI spec file not found: ${resolvedPath}`);
  }

  const specContent = await readFile(resolvedPath, "utf8");
  log(`File read: ${specContent.length} bytes`);

  if (resolvedPath.toLowerCase().endsWith(".yaml") || resolvedPath.toLowerCase().endsWith(".yml")) {
    const yaml = await import("js-yaml");
    return yaml.load(specContent) as OpenAPIV3.Document;
  }
  return JSON.parse(specContent);
}

/**
 * 加载 OpenAPI 规范文件（重构后）
 */
export async function loadOpenAPISpec(specPath: string | OpenAPIV3.Document): Promise<OpenAPIV3.Document> {
  if (typeof specPath === "string") {
    try {
      const resolvedPath = path.resolve(process.cwd(), specPath);
      log(`Loading OpenAPI spec from: ${resolvedPath}`);
      
      if (!existsSync(resolvedPath)) {
        log(`OpenAPI spec file not found: ${resolvedPath}`);
        throw new Error(`OpenAPI spec file not found: ${resolvedPath}`);
      }
      
      log(`Reading OpenAPI spec file...`);
      const specContent = await readFile(resolvedPath, "utf8");
      log(`OpenAPI spec file read successfully, length: ${specContent.length} bytes`);
      
      // 根据文件扩展名决定如何解析
      if (resolvedPath.toLowerCase().endsWith(".yaml") || resolvedPath.toLowerCase().endsWith(".yml")) {
        log(`Parsing YAML OpenAPI spec...`);
        const yaml = await import("js-yaml");
        const parsed = yaml.load(specContent) as OpenAPIV3.Document;
        log(`YAML OpenAPI spec parsed successfully`);
        return parsed;
      } else {
        log(`Parsing JSON OpenAPI spec...`);
        const parsed = JSON.parse(specContent);
        log(`JSON OpenAPI spec parsed successfully`);
        return parsed;
      }
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? `Failed to load OpenAPI spec: ${error.message}`
        : `Failed to load OpenAPI spec: ${error}`;
      
      log(errorMessage);
      throw new Error(errorMessage);
    }
  } else if (specPath) {
    log(`Using provided OpenAPI spec object`);
    return specPath as OpenAPIV3.Document;
  } else {
    const errorMessage = `No OpenAPI spec provided`;
    log(errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * 从 OpenAPI 规范中解析工具
 */
export async function parseOpenAPISpec(specPath: string | OpenAPIV3.Document): Promise<Map<string, { name: string; description: string; inputSchema: OpenAPIV3.SchemaObject; metadata?: any; }>> {
  try {
    log(`Starting to parse OpenAPI spec...`);
    const openApiSpec:OpenAPIV3.Document = await loadOpenAPISpec(specPath);
    const tools = new Map<string, { name: string; description: string; inputSchema: OpenAPIV3.SchemaObject; metadata?: any; }>();
    check(openApiSpec);
    refisterTool(openApiSpec, tools);
    return tools;
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? `Failed to parse OpenAPI spec: ${error.message}`
      : `Failed to parse OpenAPI spec: ${error}`;
    log(errorMessage);
    throw new Error(errorMessage);
  }

  function check(openApiSpec: OpenAPIV3.Document<{}>) {
    if (!openApiSpec) {
      log(`Error: OpenAPI spec is undefined or null`);
      throw new Error(`OpenAPI spec is undefined or null`);
    }

    if (!openApiSpec.paths) {
      log(`Error: OpenAPI spec does not contain paths property`);
      throw new Error(`OpenAPI spec does not contain paths property`);
    }

    log(`Successfully loaded OpenAPI spec with ${Object.keys(openApiSpec.paths).length} paths`);
  }

  function refisterTool(openApiSpec: OpenAPIV3.Document<{}>, tools: Map<string, { name: string; description: string; inputSchema: OpenAPIV3.SchemaObject; metadata?: any; }>) {
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      log(`Processing path: ${path}`);
      log(`pathItem: ${JSON.stringify(pathItem)}`);
      if (!pathItem) continue;
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;
      for (const method of httpMethods) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
        // 跳过未定义的操作
        if (!operation) continue;
        // 获取操作ID，如果没有则生成一个
        const toolName = operation.description || operation.operationId || `${method}-${path.replace(/\//g, "_").replace(/^_/, "")}`;
        const toolDescription = operation.summary || toolName;
        log(`operationId: ${toolName}`);

        // 创建工具元数据
        const metadata: any = {
          method: method.toUpperCase(),
          originalPath: path,
          parameters: operation.parameters || [],
        };

        // 提取请求体结构信息
        if (operation.requestBody && 'content' in operation.requestBody) {
          const requestBody = operation.requestBody;
          const contentTypes = Object.keys(requestBody.content || {});
          if (contentTypes.length > 0) {
            const schema = requestBody.content[contentTypes[0]].schema as OpenAPIV3.SchemaObject;
            metadata.requestBodySchema = schema;
          }
        }

        // 创建基础输入模式
        const inputSchema = ParameterProcessor.createBaseSchema();

        // 处理路径和查询参数
        if (operation.parameters) {
          ParameterProcessor.processParameters(operation.parameters, inputSchema);
        }

        // 处理请求体参数
        if (metadata.requestBodySchema) {
          ParameterProcessor.processRequestBody(metadata.requestBodySchema, inputSchema);
          
          // 确保 required 字段被正确设置
          if (metadata.requestBodySchema.required) {
            inputSchema.required = metadata.requestBodySchema.required;
          }
        }

        // 创建工具对象
        const tool = {
          name: toolName,
          description: toolDescription,
          inputSchema,
          metadata,
        };

        log(`Registered tool: ${toolName} for ${method.toUpperCase()} ${path} with inputSchema`);
        tools.set(toolName, tool);
      }
    }
  }
}
