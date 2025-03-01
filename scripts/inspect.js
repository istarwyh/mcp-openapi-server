#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = resolve(__dirname, '../bin/mcp-server.js');
const logFile = resolve(__dirname, '../inspector-debug.log');

// 清空日志文件
fs.writeFileSync(logFile, '', 'utf8');

function fileLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} ${message}\n`;
  
  try {
    fs.appendFileSync(logFile, logMessage, 'utf8');
  } catch (error) {
    process.stderr.write(`Failed to write to log file: ${error}\n`);
  }
  
  // 同时输出到控制台
  console.log(message);
}

// 验证服务器脚本路径
if (!existsSync(serverPath)) {
  fileLog(`ERROR: Server script not found at ${serverPath}`);
  process.exit(1);
}

// 验证环境变量
if (!process.env.OPENAPI_SPEC_PATH) {
  fileLog('WARNING: OPENAPI_SPEC_PATH environment variable is not set');
}

if (!process.env.API_BASE_URL) {
  fileLog('WARNING: API_BASE_URL environment variable is not set');
}

// 设置MCP_INSPECTOR环境变量
process.env.MCP_INSPECTOR = 'true';

fileLog(`Starting MCP Inspector with server: ${serverPath}`);
fileLog(`Environment variables:`);
fileLog(`  OPENAPI_SPEC_PATH: ${process.env.OPENAPI_SPEC_PATH || 'not set'}`);
fileLog(`  API_BASE_URL: ${process.env.API_BASE_URL || 'not set'}`);
fileLog(`  SERVER_NAME: ${process.env.SERVER_NAME || 'not set'}`);

const args = [
  'npx',
  '@modelcontextprotocol/inspector',
  'node',
  serverPath
];

// Add environment variables as CLI arguments if they exist
if (process.env.OPENAPI_SPEC_PATH) {
  // 验证OpenAPI规范文件路径
  const specPath = process.env.OPENAPI_SPEC_PATH;
  if (!existsSync(specPath)) {
    fileLog(`WARNING: OpenAPI spec file not found at ${specPath}`);
  } else {
    fileLog(`OpenAPI spec file exists at ${specPath}`);
  }
  
  args.push(`--openapi-spec=${specPath}`);
  fileLog(`Added argument: --openapi-spec=${specPath}`);
}

if (process.env.API_BASE_URL) {
  args.push(`--api-base-url=${process.env.API_BASE_URL}`);
  fileLog(`Added argument: --api-base-url=${process.env.API_BASE_URL}`);
}

if (process.env.SERVER_NAME) {
  args.push(`--name=${process.env.SERVER_NAME}`);
  fileLog(`Added argument: --name=${process.env.SERVER_NAME}`);
}

if (process.env.API_HEADERS) {
  // 安全地解析JSON字符串
  let headers = process.env.API_HEADERS;
  try {
    if (typeof headers === 'string' && (headers.startsWith('{') || headers.startsWith('['))) {
      JSON.parse(headers); // 只是验证，不改变原始值
      fileLog(`API_HEADERS is valid JSON`);
    }
  } catch (error) {
    fileLog(`WARNING: API_HEADERS is not valid JSON: ${error.message}`);
  }
  
  args.push(`--headers=${headers}`);
  fileLog(`Added argument: --headers=${headers}`);
}

// 确保所有环境变量被传递给子进程
const env = { ...process.env };

fileLog(`Executing command: ${args.join(' ')}`);

// Execute the command
import { spawn } from 'child_process';
const inspect = spawn(args[0], args.slice(1), { 
  stdio: 'inherit',
  env
});

inspect.on('error', (err) => {
  const errorMessage = `Failed to start inspector: ${err}`;
  fileLog(errorMessage);
  console.error(errorMessage);
  process.exit(1);
});

inspect.on('exit', (code) => {
  const exitMessage = `Inspector exited with code: ${code || 0}`;
  fileLog(exitMessage);
  process.exit(code || 0);
});
