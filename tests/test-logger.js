#!/usr/bin/env node

/**
 * 测试日志模块的功能
 * 
 * 这个脚本用于测试日志模块的各种功能，包括：
 * 1. 不同级别的日志记录
 * 2. 错误对象的处理
 * 3. 格式化输出
 */

import { log } from '../dist/logger.js';

// 创建简单的logger对象，模拟不同日志级别
const logger = {
  debug: (message, ...args) => log(`[DEBUG] ${message}`, ...args),
  info: (message, ...args) => log(`[INFO] ${message}`, ...args),
  warn: (message, ...args) => log(`[WARN] ${message}`, ...args),
  error: (message, ...args) => log(`[ERROR] ${message}`, ...args)
};

// 测试不同的日志级别和功能
function runTests() {
  console.log('开始日志模块测试...\n');

  // 测试场景1: 基本日志级别
  console.log('=== 测试场景1: 基本日志级别 ===');
  logger.debug('这是一条调试信息');
  logger.info('这是一条普通信息');
  logger.warn('这是一条警告信息');
  logger.error('这是一条错误信息');
  console.log();

  // 测试场景2: 带有错误对象的日志
  console.log('=== 测试场景2: 带有错误对象的日志 ===');
  const error = new Error('这是一个测试错误');
  logger.error('发生错误', error);
  console.log();

  // 测试场景3: 带有上下文的日志
  console.log('=== 测试场景3: 带有上下文的日志 ===');
  logger.info('带有上下文的日志', { user: 'test-user', action: 'login', status: 'success' });
  console.log();

  // 测试场景4: 嵌套对象的日志
  console.log('=== 测试场景4: 嵌套对象的日志 ===');
  logger.info('嵌套对象', {
    user: {
      id: 1,
      name: 'Test User',
      roles: ['admin', 'user'],
      settings: {
        theme: 'dark',
        notifications: true
      }
    },
    session: {
      id: 'sess-123',
      expires: new Date()
    }
  });
  console.log();

  console.log('日志模块测试完成');
  console.log('查看 mcp-server-debug.log 文件以确认日志是否正确写入');
}

// 运行测试
runTests();
