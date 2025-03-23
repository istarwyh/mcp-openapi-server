#!/usr/bin/env node

// 设置环境变量
process.env.API_BASE_URL = "https://api.deepseek.com";
process.env.OPENAPI_SPEC_PATH = "https://gitee.com/istarwyh/images/raw/master/openAICompatible.openapi.json";

// 复用 mcp-server.js 的逻辑
import("./mcp-server.js");