/**
 * OpenAPI 解析模块 - 负责加载和解析 OpenAPI 规范
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { OpenAPIV3 } from "openapi-types";
import { ExtendedTool } from "./types.js";
import { log } from "./logger.js";

/**
 * 加载 OpenAPI 规范文件
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
    const openApiSpec = await loadOpenAPISpec(specPath);
    const tools = new Map<string, ExtendedTool>();
    
    if (!openApiSpec) {
      log(`Error: OpenAPI spec is undefined or null`);
      throw new Error(`OpenAPI spec is undefined or null`);
    }
    
    if (!openApiSpec.paths) {
      log(`Error: OpenAPI spec does not contain paths property`);
      throw new Error(`OpenAPI spec does not contain paths property`);
    }
    
    log(`Successfully loaded OpenAPI spec with ${Object.keys(openApiSpec.paths).length} paths`);
    
    // 遍历所有路径
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      log(`Processing path: ${path}`);
      
      if (!pathItem) continue;
      
      // 遍历所有HTTP方法
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;
      
      for (const method of httpMethods) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
        
        // 跳过未定义的操作
        if (!operation) continue;
        
        // 获取操作ID，如果没有则生成一个
        const operationId = operation.operationId || `${method}-${path.replace(/\//g, "_").replace(/^_/, "")}`;
        
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
        
        // 创建工具参数
        const parameters: Record<string, any> = {};
        
        // 处理路径参数、查询参数和请求体参数
        if (metadata.parameters) {
          for (const param of metadata.parameters) {
            parameters[param.name] = {
              type: param.schema?.type || "string",
              description: param.description || `${param.name} parameter`,
              required: param.required || false,
            };
          }
        }
        
        // 处理请求体参数
        if (metadata.requestBodySchema) {
          const schema = metadata.requestBodySchema;
          
          // 处理顶层属性
          if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              const propSchemaObj = propSchema as OpenAPIV3.SchemaObject;
              
              // 添加顶层属性
              parameters[propName] = {
                type: propSchemaObj.type || "object",
                description: propSchemaObj.description || `${propName} parameter`,
                required: schema.required?.includes(propName) || false,
              };
              
              // 处理嵌套对象
              if (propSchemaObj.type === "object" && propSchemaObj.properties) {
                for (const [nestedPropName, nestedPropSchema] of Object.entries(propSchemaObj.properties)) {
                  const nestedPropSchemaObj = nestedPropSchema as OpenAPIV3.SchemaObject;
                  const paramName = `${propName}_${nestedPropName}`;
                  
                  // 添加嵌套属性作为扁平参数
                  parameters[paramName] = {
                    type: nestedPropSchemaObj.type || "string",
                    description: nestedPropSchemaObj.description || `${paramName} parameter`,
                    required: propSchemaObj.required?.includes(nestedPropName) || false,
                  };
                }
              }
            }
          }
        }
        
        // 注册工具
        tools.set(operationId, {
          name: operationId,
          description,
          parameters,
          metadata,
        });
        
        log(`Registered tool: ${operationId} for ${method.toUpperCase()} ${path} `);
      }
    }
    
    return tools;
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? `Failed to parse OpenAPI spec: ${error.message}`
      : `Failed to parse OpenAPI spec: ${error}`;
      
    log(errorMessage);
    throw new Error(errorMessage);
  }
}
