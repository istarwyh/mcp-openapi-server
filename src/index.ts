#!/usr/bin/env node

import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { getConfig } from './config.js';
import { log } from './logger.js';
import { OpenAPIMCPServer } from './server.js';

// 使用全局变量确保main()只被调用一次
// @ts-ignore
if (!global.__mcpServerStarted) {
  // @ts-ignore
  global.__mcpServerStarted = false;
}

// 使用log函数而不是console.log
log("index.ts module loaded");
log(`process.argv[1]: ${process.argv[1]}`);

/**
 * 解析命令行参数
 */
const argv = yargs(hideBin(process.argv))
  .option('api-base-url', {
    type: 'string',
    description: 'Base URL for the API',
  })
  .option('openapi-spec-path', {
    type: 'string',
    description: 'Path to OpenAPI specification file',
  })
  .option('bearer-token', {
    type: 'string',
    description: 'Bearer token for authentication',
  })
  .option('agent-id', {
    type: 'string',
    description: 'Agent ID for authentication',
  })
  .option('name', {
    type: 'string',
    description: 'Server name',
  })
  .option('server-version', {
    type: 'string',
    description: 'Server version',
  })
  .help()
  .version(false)
  .argv;

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    log("Starting MCP server...");
    const config = getConfig(argv as Record<string, any>);
    log(`Config loaded: ${JSON.stringify(config, null, 2)}`);
    
    const server = new OpenAPIMCPServer(config);
    await server.start();
    log("Server started successfully");
  } catch (error) {
    log(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

// 智能入口点检查
log("About to check if this is the entry point");

// 检查是否是直接运行或通过mcp-server.js运行
// const isDirectEntry = import.meta.url === `file://${process.argv[1]}`;
const isMcpServerEntry = process.argv[1]?.includes('mcp-server');
const isMcpapiEntry = process.argv[1]?.includes('mcpapi');
const isMcpInspector = process.env.MCP_INSPECTOR === 'true';

// 记录检查结果
log(`MCP server entry check: ${isMcpServerEntry}`);
log(`MCP api entry check: ${isMcpapiEntry}`);
log(`MCP inspector environment check: ${isMcpInspector}`);

// @ts-ignore
if ((isMcpServerEntry || isMcpapiEntry || isMcpInspector) && !global.__mcpServerStarted) {
  log("This is a valid entry point, calling main()");
  // @ts-ignore
  global.__mcpServerStarted = true;
  main();
} else {
  log("This is NOT the entry point or server already started, main() will not be called");
  log(`process.argv[1]: ${process.argv[1]}`);
  // @ts-ignore
  log(`Server already started: ${global.__mcpServerStarted}`);
}

// Export for external use
export { main };
