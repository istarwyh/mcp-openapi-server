/**
 * 类型定义模块 - 集中管理所有类型定义
 */

import { OpenAPIV3 } from "openapi-types";

/**
 * 扩展工具接口
 */
export interface ExtendedTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  inputSchema?: any;
  metadata: {
    originalPath: string;
    requestBodySchema: any;
    method: string;
    parameters?: any[];
    [key: string]: any;
  };
}

/**
 * 服务器配置接口
 */
export interface Config {
  apiBaseUrl: string;
  openApiSpec: string | OpenAPIV3.Document;
  name: string;
  serverVersion: string;
  headers?: Record<string, string>;
  defaults: Record<string, any>;
}

/**
 * HTTP 请求配置接口
 */
export interface RequestConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  data?: any;
  params?: any;
}
