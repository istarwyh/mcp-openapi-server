#!/usr/bin/env node

// Create a simple file logger that doesn't interfere with stdout/stderr
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.resolve(__dirname, '../mcp-server-debug.log');

// Clear the log file
fs.writeFileSync(logFile, '', 'utf8');

function fileLog(message) {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch (error) {
    // 如果无法写入文件，使用stderr
    process.stderr.write(`Failed to write to log file: ${error}\n`);
  }
}

/**
 * 安全地解析JSON字符串
 * 如果解析失败，返回原始字符串
 */
function safeJsonParse(str) {
  if (typeof str !== 'string') return str;
  
  try {
    // 检查是否是JSON字符串
    if (str.startsWith('{') || str.startsWith('[')) {
      return JSON.parse(str);
    }
    return str;
  } catch (error) {
    fileLog(`Warning: Failed to parse JSON string: ${error.message}`);
    return str;
  }
}

/**
 * 处理环境变量
 * 确保所有JSON格式的环境变量都被正确解析
 */
function processEnvironmentVariables() {
  fileLog("Processing environment variables");
  
  // 处理可能包含JSON的环境变量
  const jsonEnvVars = ['API_HEADERS', 'DEFAULT_PARAMS', 'TOOL_CONFIG'];
  
  for (const key of jsonEnvVars) {
    if (process.env[key]) {
      try {
        const parsed = safeJsonParse(process.env[key]);
        // 如果解析成功且结果不同于原始值，则更新环境变量
        if (JSON.stringify(parsed) !== process.env[key]) {
          process.env[key] = JSON.stringify(parsed);
          fileLog(`Processed ${key} as JSON`);
        }
      } catch (error) {
        fileLog(`Warning: Failed to process ${key}: ${error.message}`);
      }
    }
  }
  
  // 验证关键环境变量
  if (process.env.OPENAPI_SPEC_PATH) {
    const specPath = process.env.OPENAPI_SPEC_PATH;
    if (!existsSync(specPath)) {
      fileLog(`WARNING: OpenAPI spec file not found at ${specPath}`);
    } else {
      fileLog(`OpenAPI spec file exists at ${specPath}`);
    }
  } else {
    fileLog(`WARNING: OPENAPI_SPEC_PATH environment variable is not set`);
  }
  
  if (!process.env.API_BASE_URL) {
    fileLog(`WARNING: API_BASE_URL environment variable is not set`);
  }
  
  // 记录处理后的环境变量
  const envVarsToLog = {
    API_BASE_URL: process.env.API_BASE_URL,
    OPENAPI_SPEC_PATH: process.env.OPENAPI_SPEC_PATH,
    MCP_INSPECTOR: process.env.MCP_INSPECTOR
  };
  
  fileLog(`Environment variables after processing: ${JSON.stringify(envVarsToLog)}`);
}

/**
 * 设置进程事件处理程序
 */
function setupProcessHandlers() {
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    fileLog(`Uncaught exception: ${error.stack || error.message}`);
    process.stderr.write(`Uncaught exception: ${error.message}\n`);
    // 不立即退出，让MCP服务器有机会处理
  });
  
  // 处理未处理的Promise拒绝
  process.on('unhandledRejection', (reason, promise) => {
    fileLog(`Unhandled Promise rejection: ${reason}`);
    // 不立即退出，让MCP服务器有机会处理
  });
  
  // 处理进程退出
  process.on('exit', (code) => {
    fileLog(`Process exiting with code: ${code}`);
  });
}

// 主函数
async function main() {
  try {
    fileLog("MCP Server script started");
    fileLog(`Process arguments: ${JSON.stringify(process.argv)}`);
    fileLog(`Node.js version: ${process.version}`);
    fileLog(`Current working directory: ${process.cwd()}`);
    
    // 处理环境变量
    processEnvironmentVariables();
    
    // 设置进程处理程序
    setupProcessHandlers();
    
    // 检查是否在MCP Inspector环境中运行
    if (process.env.MCP_INSPECTOR === 'true') {
      fileLog("Running in MCP Inspector environment");
      
      // 确保stdio流处于正确状态
      if (process.stdin.isTTY) {
        fileLog("Warning: stdin is a TTY, which may cause issues with stdio transport");
      }
      
      if (process.stdout.isTTY) {
        fileLog("Warning: stdout is a TTY, which may cause issues with stdio transport");
      }
      
      // 检查stdin和stdout是否可用
      fileLog(`stdin status - readable: ${process.stdin.readable}, destroyed: ${process.stdin.destroyed}`);
      fileLog(`stdout status - writable: ${process.stdout.writable}, destroyed: ${process.stdout.destroyed}`);
      
      // 监听stdin的关闭事件
      process.stdin.on('close', () => {
        fileLog('stdin stream closed');
      });
      
      process.stdin.on('error', (error) => {
        fileLog(`stdin error: ${error}`);
      });
      
      process.stdout.on('error', (error) => {
        fileLog(`stdout error: ${error}`);
      });
    }
    
    // 导入并启动服务器
    fileLog("Importing server bundle...");
    try {
      await import("../dist/bundle.js");
      fileLog("Server bundle imported");
    } catch (error) {
      fileLog(`Error importing server bundle: ${error.stack || error.message}`);
      throw error;
    }
  } catch (error) {
    fileLog(`Fatal error in MCP server script: ${error.stack || error.message}`);
    process.stderr.write(`Fatal error in MCP server: ${error.message}\n`);
    process.exit(1);
  }
}

// 执行主函数
main().catch(error => {
  fileLog(`Unhandled error in main: ${error.stack || error.message}`);
  process.stderr.write(`Unhandled error in MCP server: ${error.message}\n`);
  process.exit(1);
});
