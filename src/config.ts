/**
 * 配置模块 - 提供统一的配置处理逻辑
 * 
 * 这个模块集中处理所有与配置相关的逻辑，包括：
 * - 环境变量解析
 * - JSON字符串解析
 * - 嵌套参数处理
 * - 默认值应用
 */

import { log } from './logger.js';

/**
 * 解析环境变量中的默认值
 * 处理以DEFAULT_开头的环境变量，支持嵌套结构和JSON解析
 */
export function parseEnvironmentDefaults(): Record<string, any> {
  const defaults: Record<string, any> = {};
  
  // 遍历所有环境变量
  for (const [key, value] of Object.entries(process.env)) {
    // 只处理以DEFAULT_开头的环境变量
    if (key.startsWith('DEFAULT_')) {
      // 移除DEFAULT_前缀
      const paramName = key.substring('DEFAULT_'.length);   
      // 尝试解析JSON字符串
      let parsedValue = value;
      try {
        // 检查值是否是JSON字符串
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          parsedValue = JSON.parse(value);
        }
      } catch (e) {
        // 如果解析失败，使用原始值
        const errorMessage = `Warning: Failed to parse JSON value for ${key}: ${(e as Error).message}`;
        console.warn(errorMessage);
        if (typeof log === 'function') {
          log(errorMessage);
        }
      }
      
      defaults[paramName] = parsedValue;
      
    }
  }
  
  return defaults;
}


function parseHeaders(headerStr?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (headerStr) {
    log(`Header string: ${headerStr}`);
    const cleanHeaderStr = headerStr.replace(/^"|"$/g, '').trim();
    cleanHeaderStr.split(",").forEach((header) => {
      const [key, value] = header.split(":");
      if (key && value) headers[key.trim()] = value.trim();
    });
  }
  log(`Headers:`, headers);
  headers['Content-Type'] = 'application/json';
  return headers;
}


/**
 * 获取服务器配置
 * 合并命令行参数、环境变量和默认值
 */
export function getConfig(argv: Record<string, any> = {}): {
  apiBaseUrl: string;
  openApiSpec: string;
  name: string;
  serverVersion: string;
  headers: Record<string, string>;
  defaults: Record<string, any>;
} {
  const defaults = parseEnvironmentDefaults();
  if (argv['agent-id']) {
    defaults['agentId'] = argv['agent-id'];
  }
  if (argv['bearer-token'] || process.env.BEARER_TOKEN) {
    process.env.API_HEADERS = `Authorization:Bearer ${argv['bearer-token'] || process.env.BEARER_TOKEN}`;
  }
  const headers = parseHeaders(process.env.API_HEADERS);

  const config = {
    apiBaseUrl: argv['api-base-url'] || process.env.API_BASE_URL,
    openApiSpec: argv['openapi-spec-path'] || process.env.OPENAPI_SPEC_PATH,
    name: argv.name || process.env.SERVER_NAME,
    serverVersion: argv['server-version'] || process.env.SERVER_VERSION,
    headers: headers,
    defaults,
  };

  if (!config.apiBaseUrl) {
    throw new Error(
      "API base URL is required (--api-base-url or API_BASE_URL)",
    );
  }
  if (!config.openApiSpec) {
    throw new Error(
      "OpenAPI spec is required (--openapi-spec-path or OPENAPI_SPEC_PATH)",
    );
  }

  if (typeof log === 'function') {
    log(`Environment defaults:`, defaults);
    log(`OpenAPI spec path: ${config.openApiSpec}`);
  }
  
  return config;
}
