/**
 * OpenAPI 解析模块 - 遵循SRP原则重构后的版本
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { OpenAPIV3 } from "openapi-types";
import { ExtendedTool } from "./types.js";
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

  static processParameters(
    parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[],
    baseSchema: OpenAPIV3.SchemaObject
  ): OpenAPIV3.SchemaObject {
    const inputSchema = { ...baseSchema };

    // 过滤出有效的参数对象（排除引用）
    const parameterObjects = parameters.filter((p): p is OpenAPIV3.ParameterObject => 
      !('$ref' in p)
    );

    for (const param of parameterObjects) {
      this.addParameterToSchema(param, inputSchema);
    }

    this.cleanSchema(inputSchema);
    return inputSchema;
  }

  /**
   * 处理请求体schema并合并到输入schema
   */
  static processRequestBody(
    requestBodySchema: OpenAPIV3.SchemaObject,
    inputSchema: OpenAPIV3.SchemaObject
  ) {
    inputSchema.properties = inputSchema.properties || {};
    inputSchema.required = inputSchema.required || [];

    if (requestBodySchema.properties) {
      for (const [propName, propSchema] of Object.entries(requestBodySchema.properties)) {
        if ('$ref' in propSchema) continue;

        const propType = propSchema.type || 'object';
        if (propType !== 'object' && propType !== 'array') {
          continue;
        }
        inputSchema.properties[propName] = {
          type: propType as OpenAPIV3.NonArraySchemaObjectType,
          description: propSchema.description || `${propName} parameter`,
        };

        // 处理嵌套对象
        if (propType === 'object' && propSchema.properties) {
          this.processNestedProperties(propName, propSchema, inputSchema);
        }

        // 处理必填项
        if (requestBodySchema.required?.includes(propName)) {
          inputSchema.required.push(propName);
        }
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
   * 添加单个参数到schema
   */
  private static addParameterToSchema(
    param: OpenAPIV3.ParameterObject,
    schema: OpenAPIV3.SchemaObject
  ) {
    const propName = param.name;
    const schemaType = param.schema && 'type' in param.schema 
      ? param.schema.type 
      : "string";

    schema.properties = schema.properties || {};
    schema.required = schema.required || [];

    schema.properties[propName] = {
      type: schemaType as OpenAPIV3.NonArraySchemaObjectType,
      description: param.description || `${propName} parameter`,
    };

    if (param.required) {
      schema.required.push(propName);
    }
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

      inputSchema.properties![fullName] = {
        type: childType,
        description: childSchema.description || `${fullName} parameter`,
      };

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
export async function parseOpenAPISpec(specPath: string | OpenAPIV3.Document): Promise<Map<string, ExtendedTool>> {
  try {
    log(`Starting to parse OpenAPI spec...`);
    const openApiSpec:OpenAPIV3.Document = await loadOpenAPISpec(specPath);
    const tools = new Map<string, ExtendedTool>();
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

  function refisterTool(openApiSpec: OpenAPIV3.Document<{}>, tools: Map<string, ExtendedTool>) {
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
        const operationId = pathItem[method]?.description || operation.operationId || `${method}-${path.replace(/\//g, "_").replace(/^_/, "")}`;
        log(`operationId: ${operationId}`);

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
            const contentType = contentTypes[0];
            const schema = requestBody.content?.[contentType]?.schema;
            if (schema) {
              metadata.requestBodySchema = schema;
            }
          }
        }

        // 创建工具描述
        const description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;

        const inputSchema = ParameterProcessor.processParameters(
          metadata.parameters || [],
          ParameterProcessor.createBaseSchema()
        );

        // 处理请求体参数
        if (metadata.requestBodySchema) {
          ParameterProcessor.processRequestBody(
            metadata.requestBodySchema,
            inputSchema
          );
        }

        // 追加参数元数据，方便检查
        const parameters = ParameterProcessor.createParametersMetadata(inputSchema);
        ParameterProcessor.cleanSchema(inputSchema);

        // 注册工具
        tools.set(operationId, {
          name: operationId,
          description,
          inputSchema,
          parameters,
          metadata,
        });

        log(`Registered tool: ${operationId} for ${method.toUpperCase()} ${path} with inputSchema`);
      }
    }
  }
}
