/**
 * 请求处理模块 - 负责处理 API 请求和响应
 */

import axios, { AxiosResponse } from "axios";
import { OpenAPIV3 } from "openapi-types";
import { ExtendedTool, RequestConfig } from "./types.js";
import { log } from "./logger.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { handleSSEResponse } from "./sse-response-handler.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * 递归地应用默认值到请求体
 */
export function applyEnvironmentDefaults(requestBody: Record<string, any>, envDefaults: Record<string, any>): void {
  for (const [key, defaultValue] of Object.entries(envDefaults)) {
    // 如果请求体中没有该属性，则使用默认值
    if (typeof defaultValue !== "object" && defaultValue !== null) {
      requestBody[key] = defaultValue;
    } else if (typeof defaultValue === "object" && defaultValue !== null && !Array.isArray(defaultValue)) {
      // 如果默认值是对象，则递归应用
      if (typeof requestBody[key] !== "object") {
        requestBody[key] = {};
      }
      
      // 递归应用嵌套对象的默认值
      applyEnvironmentDefaults(requestBody[key], defaultValue);
    }
  }
}

/**
 * 处理嵌套对象属性
 */
function processNestedProperties(
  propName: string, 
  propSchemaObj: OpenAPIV3.SchemaObject, 
  args: Record<string, any>,
  requestBody: Record<string, any>
): void {
  if (!propSchemaObj.properties) return;
  for (const [nestedPropName, _] of Object.entries(propSchemaObj.properties)) {
    const paramName = `${propName}_${nestedPropName}`;
    if (requestBody[propName] === undefined) {
      requestBody[propName] = {};
    }
    // 优先使用请求参数中的值
    if (args[paramName] !== undefined) {
      requestBody[propName][nestedPropName] = args[paramName];
    } else if (args[propName] && args[propName][nestedPropName] !== undefined) {
      // 如果请求参数中有嵌套对象，则使用其中的值
      requestBody[propName][nestedPropName] = args[propName][nestedPropName];
    }
  }
}

/**
 * 使用请求体结构信息处理参数
 */
function processWithSchema(
  args: Record<string, any>, 
  schema: any
): Record<string, any> {
  const requestBody: Record<string, any> = {};
  if (!schema.properties) return requestBody;
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const propSchemaObj = propSchema as OpenAPIV3.SchemaObject;
    // 处理嵌套对象
    if (propSchemaObj.type === "object" && propSchemaObj.properties) {
      processNestedProperties(propName, propSchemaObj, args, requestBody);
    } else {
      // 处理顶层属性
      if (args[propName] !== undefined) {
        requestBody[propName] = args[propName];
      }
    }
  }
  return requestBody;
}

/**
 * 通用处理逻辑，用于没有结构信息的情况
 */
function processGeneric(args: Record<string, any>): Record<string, any> {
  const requestBody: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    // 检查是否是嵌套参数（包含下划线）
    if (key.includes("_")) {
      const [parentKey, childKey] = key.split("_", 2);   
      // 如果父对象不存在，则初始化它
      if (!requestBody[parentKey]) {
        requestBody[parentKey] = {};
      }
      // 将子属性添加到父对象中
      requestBody[parentKey][childKey] = value;
    } else {
      // 这是顶层参数
      requestBody[key] = value;
    }
  }
  
  return requestBody;
}

/**
 * 构建请求体
 */
export function buildRequestBody(
  args: Record<string, any>,
  tool: ExtendedTool,
  defaults: Record<string, any>
): Record<string, any> {
  let requestBody: Record<string, any>;
  log(`buildRequestBody args & defaults:`, args,defaults);

  // 根据参数结构和工具元数据选择处理策略
  if (tool.metadata?.requestBodySchema) {
    // throw new McpError(ErrorCode.InvalidRequest,`args requestBodySchema`);
    requestBody = processWithSchema(args, tool.metadata.requestBodySchema);
  } else {
    // throw new McpError(ErrorCode.InvalidRequest,`args generic`);
    requestBody = processGeneric(args);
  }
  applyEnvironmentDefaults(requestBody, defaults);
  log(`Final request body:`, requestBody);
  return requestBody;
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  tool: ExtendedTool,
  args: Record<string, any>,
  apiBaseUrl: string,
  headers: Record<string, string>,
  defaults: Record<string, any>
): Promise<any> {
  try {
    if (!tool.metadata || !tool.metadata.method || !tool.metadata.originalPath) {
      throw new Error(`Tool ${tool.name} is missing metadata or method or originalPath`);
    }
    const config: RequestConfig = buidlConfig();
    let response;
    try {
      response = await axios(config);
      logResponse(response);
      // 检查是否是 SSE 流
      if (response.headers['content-type']?.includes('text/event-stream')) {
        return handleSSEResponse(tool, response);
      }
      return {
        content: [{type:'text',text:JSON.stringify(response.data)}],
        id: tool.name,
        timestamp: new Date().toISOString()
      };
    } catch (requestError: any) {
      handleRequestError(requestError);
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error 
      ? `Error executing tool ${tool.name}: ${error.message}\n${error.stack}`
      : `Error executing tool ${tool.name}: ${error}`;
      
    log(errorMessage);
    throw new Error(errorMessage);
  }

  function logResponse(response: AxiosResponse<any, any>) {
    log(`Status code: ${response.status}`);
    log(`Response headers: ${JSON.stringify(response.headers, null, 2)}`);
    // 安全地记录响应数据，避免过大的日志
    const responseDataString = response.data;
    if (responseDataString.length > 1000) {
      log(`Response data (truncated): ${responseDataString.substring(0, 1000)}...`);
    } else {
      log(`Response data: ${responseDataString}`);
    }
  }

  function buidlConfig() {
    const config: RequestConfig = {
      method: tool.metadata.method,
      url: `${apiBaseUrl}${tool.metadata.originalPath}`,
      headers: { ...headers },
    };
    log(`Tool call: ${tool.name}`);
    log(`Request arguments:`, JSON.stringify(args, null, 2));
    if (config.method === "GET" || config.method === "DELETE") {
      config.params = args;
    } else {
      // 处理请求体
      if (args && typeof args === "object") {
        config.data = buildRequestBody(args, tool, defaults);
      } else {
        config.data = args;
      }
    }
    log(`Sending request to: ${config.url}`);
    log(`Headers: ${JSON.stringify(config.headers, null, 2)}`);
    if (config.params) {
      log(`Query parameters: ${JSON.stringify(config.params, null, 2)}`);
    }

    if (config.data) {
      log(`Request body: ${JSON.stringify(config.data, null, 2)}`);
    }
    return config;
  }

  function handleRequestError(requestError: any) {
    log(`HTTP request error for tool ${tool.name}:`);
    if (requestError.response) {
      // 服务器响应了错误状态码
      log(`Status: ${requestError.response.status}`);
      log(`Status text: ${requestError.response.statusText}`);
      log(`Response headers: ${JSON.stringify(requestError.response.headers, null, 2)}`);
      log(`Response data: ${JSON.stringify(requestError.response.data, null, 2)}`);
    } else if (requestError.request) {
      // 请求已发送但没有收到响应
      log(`No response received from server`);
      log(`Request details: ${JSON.stringify(requestError.request, null, 2)}`);
    } else {
      // 设置请求时发生错误
      log(`Error setting up request: ${requestError.message}`);
    }

    // 重新抛出错误，包含更多上下文
    throw new Error(`Failed to execute tool ${tool.name}: ${requestError.message}`);
  }
}
