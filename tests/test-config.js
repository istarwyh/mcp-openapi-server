#!/usr/bin/env node

/**
 * 测试配置模块的功能
 * 
 * 这个脚本用于测试配置模块的各种功能，包括：
 * 1. 环境变量解析
 * 2. JSON字符串解析
 * 3. 嵌套结构处理
 * 4. 默认值应用
 */

import { getConfig } from '../dist/config.js';

// 测试不同的环境变量场景
function runTests() {
  console.log('开始配置模块测试...\n');

  // 测试场景1: 基本配置
  console.log('=== 测试场景1: 基本配置 ===');
  const basicConfig = getConfig({
    openApiSpecPath: './openapi.example.yaml',
    apiBaseUrl: 'http://localhost:8080'
  });
  console.log('基本配置结果:', basicConfig);
  console.log();

  // 测试场景2: 带有默认值的配置
  console.log('=== 测试场景2: 带有默认值的配置 ===');
  process.env.DEFAULT_SERVICE_ID = 'test-service';
  process.env.DEFAULT_PARAMS_SOURCE = 'Test source';
  const configWithDefaults = getConfig({
    openApiSpecPath: './openapi.example.yaml',
    apiBaseUrl: 'http://localhost:8080'
  });
  console.log('带有默认值的配置结果:', configWithDefaults);
  console.log('环境变量默认值:', configWithDefaults.environmentDefaults);
  console.log();

  // 测试场景3: JSON格式的环境变量
  console.log('=== 测试场景3: JSON格式的环境变量 ===');
  process.env.DEFAULT_SERVICE = '{"id":"json-service","version":"1.0.0"}';
  process.env.DEFAULT_PARAMS = '{"source":"JSON source","target":"JSON target"}';
  const configWithJsonDefaults = getConfig({
    openApiSpecPath: './openapi.example.yaml',
    apiBaseUrl: 'http://localhost:8080'
  });
  console.log('JSON格式环境变量的配置结果:', configWithJsonDefaults);
  console.log('环境变量默认值:', configWithJsonDefaults.environmentDefaults);
  console.log();

  // 测试场景4: 错误的JSON格式
  console.log('=== 测试场景4: 错误的JSON格式 ===');
  process.env.DEFAULT_BROKEN_JSON = '{broken json}';
  const configWithBrokenJson = getConfig({
    openApiSpecPath: './openapi.example.yaml',
    apiBaseUrl: 'http://localhost:8080'
  });
  console.log('错误JSON格式的配置结果:', configWithBrokenJson);
  console.log('环境变量默认值:', configWithBrokenJson.environmentDefaults);
  console.log();

  // 测试场景5: 命令行参数覆盖环境变量
  console.log('=== 测试场景5: 命令行参数覆盖环境变量 ===');
  const configWithOverrides = getConfig({
    openApiSpecPath: './custom-openapi.example.yaml',
    apiBaseUrl: 'http://custom-host:9090',
    name: 'custom-server',
    version: '2.0.0'
  });
  console.log('带有覆盖的配置结果:', configWithOverrides);
  console.log();

  console.log('配置模块测试完成');
}

// 运行测试
runTests();
