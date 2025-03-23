#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { updateMCPConfig } from '../src/config-updater.js';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('name', {
    type: 'string',
    description: 'Name for the MCP server configuration'
  })
  .parse();

console.log(argv);
if (argv.name) {
  // If --name is provided, only update config and exit
  updateMCPConfig({
    name: argv.name,
    command: 'mcpapi-use-deepseek',
    argv
  });
} else {
  // Otherwise start the server
  process.env.API_BASE_URL = "https://api.deepseek.com";
  process.env.OPENAPI_SPEC_PATH = "https://gitee.com/istarwyh/images/raw/master/openAICompatible.openapi.json";

  // 复用 mcp-server.js 的逻辑
  import("./mcp-server.js");
}