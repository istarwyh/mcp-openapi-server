/**
 * 日志模块 - 提供统一的日志记录功能
 * 
 * 这个模块集中处理所有与日志相关的逻辑，包括：
 * - 控制台日志
 * - 文件日志
 * - 日志级别控制
 * - 格式化
 */

import { appendFile, writeFile, mkdir } from 'fs/promises';
import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { existsSync } from 'fs';

// 日志级别
export enum LogLevel {
  TRACE = -1,  // 添加更详细的跟踪级别
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,  // 添加致命错误级别
  NONE = 5
}

// 日志配置
interface LogConfig {
  level: LogLevel;
  filePath: string;
  useConsole: boolean;
  useStderr: boolean;
  maxMessageLength: number;  // 限制日志消息长度
  includeTimestamp: boolean;
  includeProcessInfo: boolean;
}

// 默认配置
const defaultConfig: LogConfig = {
  level: LogLevel.DEBUG,
  filePath: path.resolve(process.cwd(), 'mcp-server-debug.log'),
  useConsole: true,
  useStderr: true,
  maxMessageLength: 10000,  // 默认限制消息长度为10000字符
  includeTimestamp: true,
  includeProcessInfo: true
};

// 当前配置
let currentConfig: LogConfig = { ...defaultConfig };

// 日志初始化状态
let isInitialized = false;

/**
 * 初始化日志系统
 */
export async function initLogger(config: Partial<LogConfig> = {}): Promise<void> {
  try {
    // 合并配置
    currentConfig = { ...defaultConfig, ...config };
    
    // 确保日志目录存在
    const logDir = path.dirname(currentConfig.filePath);
    if (!existsSync(logDir)) {
      await mkdir(logDir, { recursive: true });
    }
    
    // 清空日志文件
    await writeFile(currentConfig.filePath, '', 'utf8');
    
    // 写入初始日志
    const timestamp = new Date().toISOString();
    const processInfo = currentConfig.includeProcessInfo 
      ? `pid=${process.pid}, ppid=${process.ppid}, platform=${process.platform}, node=${process.version}` 
      : '';
    
    await appendFile(
      currentConfig.filePath, 
      `${timestamp} [INFO] MCP Server logging initialized at level: ${LogLevel[currentConfig.level]} ${processInfo}\n`, 
      'utf8'
    );
    
    isInitialized = true;
  } catch (error) {
    // 使用stderr记录初始化错误
    process.stderr.write(`Failed to initialize logger: ${error}\n`);
    
    // 尝试使用同步方法作为备份
    try {
      const logDir = path.dirname(currentConfig.filePath);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      
      writeFileSync(currentConfig.filePath, '', 'utf8');
      
      const timestamp = new Date().toISOString();
      appendFileSync(
        currentConfig.filePath, 
        `${timestamp} [INFO] MCP Server logging initialized at level: ${LogLevel[currentConfig.level]} (fallback mode)\n`, 
        'utf8'
      );
      
      isInitialized = true;
    } catch (syncError) {
      process.stderr.write(`Failed to initialize logger using fallback method: ${syncError}\n`);
    }
  }
}

/**
 * 将消息写入日志文件
 */
async function logToFile(level: LogLevel, message: string): Promise<void> {
  if (level < currentConfig.level) return;
  
  try {
    const timestamp = currentConfig.includeTimestamp ? new Date().toISOString() : '';
    const levelName = LogLevel[level];
    const logLine = timestamp 
      ? `${timestamp} [${levelName}] ${message}\n` 
      : `[${levelName}] ${message}\n`;
    
    await appendFile(currentConfig.filePath, logLine, 'utf8');
  } catch (error) {
    // 如果写入文件失败，尝试使用同步方法
    try {
      const timestamp = currentConfig.includeTimestamp ? new Date().toISOString() : '';
      const levelName = LogLevel[level];
      const logLine = timestamp 
        ? `${timestamp} [${levelName}] ${message}\n` 
        : `[${levelName}] ${message}\n`;
      
      appendFileSync(currentConfig.filePath, logLine, 'utf8');
    } catch (syncError) {
      // 如果同步方法也失败，尝试使用stderr
      if (currentConfig.useStderr) {
        process.stderr.write(`Failed to write to log file: ${error}\n`);
        process.stderr.write(`Original message: ${message}\n`);
      }
    }
  }
}

/**
 * 记录跟踪级别日志
 */
export function trace(message: string, ...args: any[]): void {
  logWithLevel(LogLevel.TRACE, message, ...args);
}

/**
 * 记录调试级别日志
 */
export function debug(message: string, ...args: any[]): void {
  logWithLevel(LogLevel.DEBUG, message, ...args);
}

/**
 * 记录信息级别日志
 */
export function info(message: string, ...args: any[]): void {
  logWithLevel(LogLevel.INFO, message, ...args);
}

/**
 * 记录警告级别日志
 */
export function warn(message: string, ...args: any[]): void {
  logWithLevel(LogLevel.WARN, message, ...args);
}

/**
 * 记录错误级别日志
 */
export function error(message: string, ...args: any[]): void {
  logWithLevel(LogLevel.ERROR, message, ...args);
}

/**
 * 记录致命错误级别日志
 */
export function fatal(message: string, ...args: any[]): void {
  logWithLevel(LogLevel.FATAL, message, ...args);
}

/**
 * 根据日志级别记录日志
 */
function logWithLevel(level: LogLevel, message: string, ...args: any[]): void {
  if (level < currentConfig.level) return;
  
  // 确保日志系统已初始化
  if (!isInitialized) {
    try {
      // 尝试同步初始化
      const logDir = path.dirname(currentConfig.filePath);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      
      if (!existsSync(currentConfig.filePath)) {
        writeFileSync(currentConfig.filePath, '', 'utf8');
      }
      
      isInitialized = true;
    } catch (error) {
      // 如果初始化失败，使用stderr
      process.stderr.write(`Failed to initialize logger on-demand: ${error}\n`);
    }
  }
  
  // 格式化消息
  let formattedMessage = formatLogMessage(message, args);
  
  // 限制消息长度
  if (formattedMessage.length > currentConfig.maxMessageLength) {
    formattedMessage = formattedMessage.substring(0, currentConfig.maxMessageLength) + 
      `... [truncated, full length: ${formattedMessage.length}]`;
  }
  
  // 写入文件日志
  logToFile(level, formattedMessage).catch(() => {});
  
  // 写入控制台日志
  if (currentConfig.useConsole) {
    if (currentConfig.useStderr) {
      // 使用stderr而不是stdout，避免干扰MCP协议通信
      process.stderr.write(`[${LogLevel[level]}] ${formattedMessage}\n`);
    } else {
      // 根据日志级别使用不同的控制台方法
      switch (level) {
        case LogLevel.TRACE:
        case LogLevel.DEBUG:
          console.debug(`[${LogLevel[level]}] ${formattedMessage}`);
          break;
        case LogLevel.INFO:
          console.info(`[${LogLevel[level]}] ${formattedMessage}`);
          break;
        case LogLevel.WARN:
          console.warn(`[${LogLevel[level]}] ${formattedMessage}`);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(`[${LogLevel[level]}] ${formattedMessage}`);
          break;
      }
    }
  }
}

/**
 * 格式化日志消息
 */
function formatLogMessage(message: string, args: any[]): string {
  if (args.length === 0) return message;
  
  return `${message} ${args.map(a => {
    if (a === undefined) return 'undefined';
    if (a === null) return 'null';
    if (typeof a === 'object') {
      try {
        return JSON.stringify(a, null, 2);
      } catch (e) {
        return `[Object: ${typeof a}, stringify error: ${e.message}]`;
      }
    }
    return String(a);
  }).join(' ')}`.trim();
}

/**
 * 兼容旧的log函数
 */
export function log(message: string, ...args: any[]): void {
  info(message, ...args);
}

/**
 * 记录连接状态信息
 */
export function logConnectionStatus(): void {
  try {
    const stdinStatus = {
      readable: process.stdin.readable,
      destroyed: process.stdin.destroyed,
      isPaused: process.stdin.isPaused(),
      isTTY: process.stdin.isTTY
    };
    
    const stdoutStatus = {
      writable: process.stdout.writable,
      destroyed: process.stdout.destroyed,
      isTTY: process.stdout.isTTY
    };
    
    info('Connection status check:', {
      stdin: stdinStatus,
      stdout: stdoutStatus,
      pid: process.pid,
      ppid: process.ppid
    });
  } catch (error) {
    error(`Failed to log connection status: ${error}`);
  }
}

// 设置进程事件处理程序
process.on('uncaughtException', (error) => {
  try {
    fatal(`Uncaught exception: ${error.stack || error.message}`);
  } catch (logError) {
    process.stderr.write(`Uncaught exception (failed to log): ${error.message}\n`);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  try {
    error(`Unhandled Promise rejection: ${reason}`);
  } catch (logError) {
    process.stderr.write(`Unhandled Promise rejection (failed to log): ${reason}\n`);
  }
});
