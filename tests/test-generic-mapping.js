import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getConfig } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 简化的MCP服务器类
class MCPServer {
  constructor(config) {
    this.config = config;
    this.tools = new Map();
  }

  // 从环境变量中获取配置
  getConfig() {
    // 使用共享的配置函数
    return getConfig();
  }

  // 测试工具执行
  async testExecuteTool(tool, params) {
    try {
      // 构建请求配置
      const config = {
        method: tool.metadata.method,
        url: `${this.config.apiBaseUrl}${tool.metadata.originalPath}`,
        headers: { ...this.config.headers },
      };
      
      if (config.method === 'GET' || config.method === 'DELETE') {
        config.params = params;
      } else {
        // 处理请求体
        if (params && typeof params === "object") {
          // 获取环境变量中的默认值
          const defaults = this.getConfig().defaults;
          
          // 创建一个新对象来保存请求体
          let requestBody = {};
          
          // 检查参数是否已经是嵌套结构
          const hasNestedStructure = Object.entries(params).some(([key, value]) => 
            typeof value === 'object' && value !== null && !Array.isArray(value)
          );
          
          if (hasNestedStructure) {
            // 如果参数已经是嵌套结构，则直接使用
            requestBody = { ...params };
            
            // 处理可能的扁平参数
            for (const [key, value] of Object.entries(params)) {
              if (key.includes('_') && typeof value !== 'object') {
                const [parent, child] = key.split('_', 2);
                if (!requestBody[parent]) {
                  requestBody[parent] = {};
                }
                requestBody[parent][child] = value;
                // 删除原始的扁平参数
                delete requestBody[key];
              }
            }
          } else if (tool.metadata?.requestBodySchema) {
            // 如果工具元数据中有请求体结构信息，则使用它来重构请求体
            const schema = tool.metadata.requestBodySchema;
            
            // 处理顶层属性
            if (schema.properties) {
              for (const [propName, propSchema] of Object.entries(schema.properties)) {
                const propSchemaObj = propSchema;
                
                // 处理嵌套对象
                if (propSchemaObj.type === 'object' && propSchemaObj.properties) {
                  // 初始化顶层对象
                  if (!requestBody[propName]) {
                    requestBody[propName] = {};
                  }
                  
                  // 处理嵌套对象的属性
                  for (const [nestedPropName, nestedPropSchema] of Object.entries(propSchemaObj.properties)) {
                    const paramName = `${propName}_${nestedPropName}`;
                    
                    // 优先使用请求参数中的值
                    if (params[paramName] !== undefined) {
                      requestBody[propName][nestedPropName] = params[paramName];
                    } else if (params[propName] && params[propName][nestedPropName] !== undefined) {
                      // 如果请求参数中有嵌套对象，则使用其中的值
                      requestBody[propName][nestedPropName] = params[propName][nestedPropName];
                    }
                  }
                } else {
                  // 处理顶层属性
                  if (params[propName] !== undefined) {
                    requestBody[propName] = params[propName];
                  }
                }
              }
            }
          } else {
            // 如果没有请求体结构信息，则使用通用的处理逻辑
            for (const [key, value] of Object.entries(params)) {
              // 检查是否是嵌套参数（包含下划线）
              if (key.includes('_')) {
                const [parentKey, childKey] = key.split('_', 2);
                
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
          }
          
          // 应用环境变量默认值
          // 只有在请求体中没有相应值时才使用默认值
          if (!requestBody.service_id && defaults.service_id) {
            requestBody.service_id = defaults.service_id;
          }
          
          if (defaults.params) {
            if (!requestBody.params) {
              requestBody.params = {};
            }
            
            for (const [key, value] of Object.entries(defaults.params)) {
              if (requestBody.params[key] === undefined && value !== undefined) {
                requestBody.params[key] = value;
              }
            }
          }
          
          console.log(`最终请求体:`, JSON.stringify(requestBody, null, 2));
          config.data = requestBody;
        } else {
          config.data = params;
        }
      }
      
      // 模拟发送请求
      console.log(`将发送请求到: ${config.url}`);
      console.log(`请求方法: ${config.method}`);
      console.log(`请求体: ${JSON.stringify(config.data, null, 2)}`);
      
      // 返回模拟响应
      return {
        success: true,
        data: {
          translated_text: "This is a mock translated text",
          source_lang: config.data.params?.source_lang || "unknown",
          target_lang: config.data.params?.target_lang || "unknown"
        }
      };
    } catch (error) {
      console.error(`执行工具错误:`, error.message);
      throw error;
    }
  }
}

// 运行测试场景
async function runTestScenarios(server, tool) {
  // 测试场景1: 完全指定的嵌套参数
  console.log("\n=== 测试场景1: 完全指定的嵌套参数 ===");
  await server.testExecuteTool(tool, {
    service_id: "translation-service",
    params: {
      source_lang: "en",
      target_lang: "zh",
      source: "Hello, world!"
    }
  });

  // 测试场景2: 完全指定的扁平参数
  console.log("\n=== 测试场景2: 完全指定的扁平参数 ===");
  await server.testExecuteTool(tool, {
    service_id: "translation-service",
    params_source_lang: "en",
    params_target_lang: "zh",
    params_source: "Hello, world!"
  });

  // 测试场景3: 部分指定的嵌套参数（使用环境变量默认值）
  console.log("\n=== 测试场景3: 部分指定的嵌套参数（使用环境变量默认值） ===");
  await server.testExecuteTool(tool, {
    params: {
      source: "Hello, world!"
    }
  });

  // 测试场景4: 部分指定的扁平参数（使用环境变量默认值）
  console.log("\n=== 测试场景4: 部分指定的扁平参数（使用环境变量默认值） ===");
  await server.testExecuteTool(tool, {
    params_source: "Hello, world!"
  });

  // 测试场景5: 仅使用环境变量默认值
  console.log("\n=== 测试场景5: 仅使用环境变量默认值 ===");
  await server.testExecuteTool(tool, {});
}

// 主函数
async function main() {
  console.log('开始通用参数映射测试...\n');
  
  try {
    // 设置环境变量默认值
    process.env.DEFAULT_SERVICE_ID = 'translation-service';
    process.env.DEFAULT_PARAMS_SOURCE_LANG = 'en';
    process.env.DEFAULT_PARAMS_TARGET_LANG = 'zh';
    process.env.DEFAULT_PARAMS_SOURCE = 'Default text to translate';
    
    console.log('设置的环境变量默认值:');
    console.log('DEFAULT_SERVICE_ID =', process.env.DEFAULT_SERVICE_ID);
    console.log('DEFAULT_PARAMS_SOURCE_LANG =', process.env.DEFAULT_PARAMS_SOURCE_LANG);
    console.log('DEFAULT_PARAMS_TARGET_LANG =', process.env.DEFAULT_PARAMS_TARGET_LANG);
    console.log('DEFAULT_PARAMS_SOURCE =', process.env.DEFAULT_PARAMS_SOURCE);
    
    // 创建MCP服务器
    const server = new MCPServer({
      apiBaseUrl: 'http://localhost:8888',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });
    
    // 模拟工具
    const tool = {
      id: 'translation-service',
      name: 'Translation Service',
      description: 'Translates text from one language to another',
      metadata: {
        method: 'POST',
        originalPath: '/translate',
        requestBodySchema: {
          type: 'object',
          properties: {
            service_id: {
              type: 'string',
              description: 'The ID of the translation service to use'
            },
            params: {
              type: 'object',
              properties: {
                source_lang: {
                  type: 'string',
                  description: 'The source language'
                },
                target_lang: {
                  type: 'string',
                  description: 'The target language'
                },
                source_text: {
                  type: 'string',
                  description: 'The text to translate'
                }
              }
            }
          }
        }
      }
    };
    
    // 运行测试场景
    await runTestScenarios(server, tool);
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
main().catch(error => {
  console.error('测试失败:', error);
});
