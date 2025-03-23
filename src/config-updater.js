import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Find all potential MCP configuration files in the system
 * @returns {string[]} List of found configuration file paths
 */
export function findConfigFiles() {
  const searchPaths = [
    // Application support directory (macOS)
    path.join(os.homedir(), 'Library', 'Application Support', 'Visual Studio Code'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Code'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Windsurf'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Cursor'),
    path.join(os.homedir(), '.config'),
  ];

  const configFiles = [];
  const searchNames = ['cline_mcp_settings.json', 'mcp.json'];

  console.log('Searching for configuration files in:');
  for (const searchPath of searchPaths) {
    console.log(`- ${searchPath}`);
    try {
      const findConfigInDir = (dir) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && searchNames.includes(item)) {
              configFiles.push(fullPath);
            } else if (stat.isDirectory() && !item.startsWith('.')) {
              // Recursively search in subdirectories, but skip hidden ones
              findConfigInDir(fullPath);
            }
          } catch (error) {
            // Skip files/directories we can't access
          }
        }
      };

      findConfigInDir(searchPath);
    } catch (error) {
      // Skip directories we can't access
    }
  }

  return configFiles;
}

/**
 * Updates MCP server configuration in the user's config files
 * @param {Object} options Configuration options
 * @param {string} options.name Name of the MCP server configuration
 * @param {string} options.command Command to run (e.g., 'mcpapi' or 'mcpapi-use-deepseek')
 * @param {Object} options.argv All command line arguments
 * @returns {void}
 */
export function updateMCPConfig({ name, command, argv }) {
  if (!name) {
    return; // Don't update config if name is not provided
  }

  const configFiles = findConfigFiles();
  console.log('\nFound configuration files:');
  configFiles.forEach(file => console.log(`- ${file}`));

  let configPath;
  let config;

  // Try to find existing config file
  for (const file of configFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      config = JSON.parse(content);
      configPath = file;
      console.log(`\nUsing existing configuration file: ${file}`);
      break;
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
    }
  }

  // Create new config if none exists
  if (!config) {
    configPath = path.join(os.homedir(), '.config', 'cline_mcp_settings.json');
    config = { mcpServers: {} };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    console.log(`\nCreating new configuration file: ${configPath}`);
  }

  // Convert argv to args array, excluding special properties and name
  const args = [];
  const seenArgs = new Set(); // 用于跟踪已处理的参数

  for (const [key, value] of Object.entries(argv)) {
    // Skip special yargs properties, name, and already processed args
    if (['_', '$0', 'name'].includes(key) || seenArgs.has(key)) continue;

    // 如果是 camelCase 格式，跳过（我们会处理对应的 kebab-case 版本）
    if (key !== key.toLowerCase() && argv[key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())]) continue;

    seenArgs.add(key);
    args.push(`--${key}`, value.toString());
  }

  // Update or add server configuration
  config.mcpServers = config.mcpServers || {};
  config.mcpServers[name] = {
    command,
    args,
    env: {},
    disabled: false,
    autoApprove: []
  };

  // Save the updated configuration
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\nUpdated configuration in ${configPath}`);
  
  // Exit after configuration update
  process.exit(0);
}
