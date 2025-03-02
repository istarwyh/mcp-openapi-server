/**
 * 服务器模块 - 负责创建和管理 MCP 服务器
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { Config, ExtendedTool } from "./types.js";
import { parseOpenAPISpec } from "./openapi-parser.js";
import { executeToolCall } from "./request-handler.js";
import { log } from "./logger.js";
import { existsSync } from 'fs';
import path from 'path';

/**
 * OpenAPI MCP 服务器类
 */
export class OpenAPIMCPServer {
  private server: Server;
  private tools: Map<string, ExtendedTool>;
  private config: Config;
  private transport: StdioServerTransport | null = null;
  
  /**
   * 构造函数
   */
  constructor(config: Config) {
    this.config = config;
    this.tools = new Map();
    
    this.server = new Server({
      name: config.name || 'openapi-mcp-server',
      version: config.serverVersion || '1.0.0',
    });
    
    log(`Initializing OpenAPI MCP Server with config:`, config);

    // 设置进程退出处理
    this.setupProcessHandlers();
  }

  /**
   * 设置进程事件处理程序
   * 确保在进程退出时进行清理
   */
  private setupProcessHandlers(): void {
    // 处理进程退出信号
    const exitHandler = async (signal: string): Promise<void> => {
      log(`Received ${signal} signal, shutting down server...`);
      try {
        await this.cleanup();
        log('Server shutdown complete');
        process.exit(0);
      } catch (error) {
        log(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    };

    // 注册信号处理程序
    process.on('SIGINT', () => exitHandler('SIGINT'));
    process.on('SIGTERM', () => exitHandler('SIGTERM'));
    process.on('uncaughtException', (error) => {
      log(`Uncaught exception: ${error.stack || error.message}`);
      exitHandler('uncaughtException').catch(() => process.exit(1));
    });
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    log('Cleaning up server resources...');
    if (this.transport) {
      try {
        // 尝试断开连接
        log('Disconnecting transport...');
        await this.server.disconnect();
        log('Transport disconnected successfully');
      } catch (error) {
        log(`Error disconnecting transport: ${error}`);
      }
    }
  }
  
  /**
   * 初始化请求处理程序
   */
  private initializeHandlers(): void {
    // 注册工具列表处理程序
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      log('Handling ListTools request');
      return {
        tools: Array.from(this.tools.values())
      };
    });
    
    // 注册工具调用处理程序
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = this.tools.get(name);
      if (!tool) {
        throw new McpError (ErrorCode.InvalidParams,`Tool not found: ${name}`);
      }
      // if (!args || args.length === 0) {
      //   throw new McpError(ErrorCode.InvalidRequest,`args is undefined`);
      // }
      log(`Executing tool: ${name} with args:`, args);
      this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: '',
          toolName: tool.name,
          progress: 0
        }
      })
      try {
        return await executeToolCall(
          tool,
          args || {},
          this.config.apiBaseUrl,
          this.config.headers || {},
          this.config.defaults
        );
      } catch (error) {
        const errorMsg = `Error executing tool ${name}: ${error}`;
        log(errorMsg);
        throw new Error(errorMsg);
      }
    });
  }
  
  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    try {
      log("Server.start() called");
      
      // 验证OpenAPI规范文件路径
      if (!this.config.openApiSpec) {
        log("ERROR: OPENAPI_SPEC_PATH environment variable is not set. Using default: ../openapi.example.yaml");
        this.config.openApiSpec = "../openapi.example.yaml";
      }
      
      const resolvedSpecPath = path.resolve(process.cwd(), this.config.openApiSpec);
      log(`Resolved OpenAPI spec path: ${resolvedSpecPath}`);
      
      if (!existsSync(resolvedSpecPath)) {
        throw new Error(`OpenAPI spec file not found: ${resolvedSpecPath}`);
      }
      
      // 解析 OpenAPI 规范
      log("Parsing OpenAPI spec...");
      try {
        this.tools = await parseOpenAPISpec(this.config.openApiSpec);
        log(`Successfully parsed OpenAPI spec, found ${this.tools.size} tools`);
      } catch (error) {
        log(`Error parsing OpenAPI spec: ${error}`);
        throw error;
      }
      this.initializeHandlers();
      log(`Starting MCP server with ${this.tools.size} tools`);
      // 创建传输层
      log("Creating transport...");
      this.transport = new StdioServerTransport();
      // 连接到传输层
      log("Connecting to transport...");
      // 添加超时处理
      const connectionPromise = this.server.connect(this.transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000);
      });
      // 使用Promise.race来处理连接超时
      await Promise.race([connectionPromise, timeoutPromise])
        .then(() => {
          log(`MCP server connected successfully via stdio transport`);
          setTimeout(() => {
            this.verifyConnection();
          }, 1000);
        })
        .catch((error) => {
          log(`Connection error: ${error}`);
          throw error;
        });
      
      log(`MCP server started successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? `Error starting MCP server: ${error.message}\n${error.stack}`
        : `Error starting MCP server: ${error}`;
        
      log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * 验证连接状态
   */
  private verifyConnection(): void {
    try {
      // 检查stdio流状态
      const stdinReadable = !process.stdin.destroyed && process.stdin.readable;
      const stdoutWritable = !process.stdout.destroyed && process.stdout.writable;
      log(`Connection verification - stdin readable: ${stdinReadable}, stdout writable: ${stdoutWritable}`);
      if (!stdinReadable || !stdoutWritable) {
        log('WARNING: stdio streams may be in an invalid state, which could affect MCP communication');
      }
      
      // 尝试发送一个心跳消息来验证连接
      log('Sending heartbeat to verify connection...');
      try {
        // 直接检查transport的状态
        if (this.transport) {
          log('Transport is initialized');
        } else {
          log('WARNING: Transport is null');
        }
      } catch (error) {
        log(`Error during heartbeat: ${error}`);
      }
    } catch (error) {
      log(`Error verifying connection: ${error}`);
    }
  }
}
