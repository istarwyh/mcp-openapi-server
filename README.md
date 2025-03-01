# OpenAPI MCP Server

A Model Context Protocol (MCP) server that exposes OpenAPI endpoints as MCP resources. This server allows Large Language Models to discover and interact with REST APIs defined by OpenAPI specifications through the MCP protocol.

## Quick Start

You do not need to clone this repository to use this MCP server. You can simply configure it in Claude Desktop:

1. Locate or create your Claude Desktop configuration file:
   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

2. Add the following configuration to enable the OpenAPI MCP server:

```json
{
  "mcpServers": {
    "openapi": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "API_BASE_URL": "https://api.example.com",
        "OPENAPI_SPEC_PATH": "https://api.example.com/openapi.json",
        "API_HEADERS": "Authorization:Bearer token123,X-API-Key:your-api-key"
      }
    }
  }
}
```

3. Replace the environment variables with your actual API configuration:
   - `API_BASE_URL`: The base URL of your API
   - `OPENAPI_SPEC_PATH`: URL or path to your OpenAPI specification
   - `API_HEADERS`: Comma-separated key:value pairs for API authentication headers

## Features

- Automatically converts OpenAPI specifications into MCP tools
- Supports all HTTP methods (GET, POST, PUT, PATCH, DELETE) for API calls
- Preserves original path structure from OpenAPI specification
- Handles nested request body structures
- Supports default values from environment variables
- Flexible parameter mapping with priority:
  1. Explicit request parameters
  2. Environment variable defaults
  3. OpenAPI specification defaults
- Comprehensive logging for debugging
- Centralized configuration management
- Modular architecture with clear separation of concerns

## Architecture

The server is built with a modular architecture:

- **Core Server (`src/index.ts`)**: Handles MCP protocol implementation and tool registration
- **Configuration Module (`src/config.ts`)**: Centralizes all configuration handling
- **Logging Module (`src/logger.ts`)**: Provides unified logging capabilities
- **Command Line Interface (`bin/mcp-server.js`)**: Entry point with argument parsing

### Configuration Module

The configuration module provides a single source of truth for all server settings:

```typescript
import { getConfig } from './config';

// Get configuration with defaults
const config = getConfig({
  openApiSpecPath: './openapi.yaml',
  apiBaseUrl: 'http://localhost:8080'
});
```

### Logging Module

The logging module offers consistent logging across the application:

```typescript
import { logger } from './logger';

// Log at different levels
logger.debug('Detailed debug information');
logger.info('General information');
logger.warn('Warning message');
logger.error('Error information', new Error('Something went wrong'));
```

## Development Tools

This project includes several development tools to make your workflow easier:

### Building

- `npm run build` - Builds the TypeScript source
- `npm run clean` - Removes build artifacts
- `npm run typecheck` - Runs TypeScript type checking

### Development Mode

- `npm run dev` - Watches source files and rebuilds on changes
- `npm run inspect-watch` - Runs the inspector with auto-reload on changes

### Testing

- `node test-request.js` - Simulates an MCP tool call to test the server
- `node monitor-logs.js` - Monitors the log file for debugging
- `node test-server.js` - Starts the server with logging enabled

### Code Quality

- `npm run lint` - Runs ESLint
- `npm run typecheck` - Verifies TypeScript types

## Configuration

The server can be configured through environment variables or command line arguments:

### Environment Variables

- `API_BASE_URL` - Base URL for the API endpoints
- `OPENAPI_SPEC_PATH` - Path or URL to OpenAPI specification
- `API_HEADERS` - Comma-separated key:value pairs for API headers
- `SERVER_NAME` - Name for the MCP server (default: "mcp-openapi-server")
- `SERVER_VERSION` - Version of the server (default: "1.0.0")

### Command Line Arguments

```bash
npm run inspect -- \
  --api-base-url https://api.example.com \
  --openapi-spec https://api.example.com/openapi.json \
  --headers "Authorization:Bearer token123,X-API-Key:your-api-key" \
  --name "my-mcp-server" \
  --version "1.0.0"
```

## Installation

```bash
npm install
```

## Usage

```bash
node dist/index.js --openapi-spec=<path-to-openapi-spec> --api-base-url=<api-base-url> --name=<server-name> --server-version=<version>
```

### Command Line Options

- `--openapi-spec`: Path to the OpenAPI specification file (required)
- `--api-base-url`: Base URL for the API (required)
- `--name`: Name of the MCP server (default: "mcp-openapi-server")
- `--server-version`: Version of the server (default: "1.0.0")
- `--headers`: Additional headers to include in all requests (format: "key1=value1,key2=value2")

### Environment Variables

You can also configure the server using environment variables:

- `OPENAPI_SPEC_PATH`: Path to the OpenAPI specification file
- `API_BASE_URL`: Base URL for the API
- `SERVER_NAME`: Name of the MCP server
- `SERVER_VERSION`: Version of the server
- `DEFAULT_*`: Default values for parameters

#### Default Parameter Values

You can set default values for parameters using environment variables with the `DEFAULT_` prefix:

```bash
# Simple defaults
export DEFAULT_API_KEY=your-api-key

# Nested structure defaults (two formats supported)
export DEFAULT_SERVICE_ID=translation_service
# OR
export DEFAULT_SERVICE='{"id":"translation_service"}'

# For nested parameters
export DEFAULT_PARAMS_SOURCE_LANG=English
# OR
export DEFAULT_PARAMS='{"source_lang":"English","target_lang":"Spanish"}'
```

The server will use these default values if they are not provided in the request.

## Development Workflow

1. Start the development environment:
```bash
npm run inspect-watch
```

2. Make changes to the TypeScript files in `src/`
3. The server will automatically rebuild and restart
4. Use the MCP Inspector UI to test your changes

## Project Structure

```
├── bin/                  # Command-line executables
│   └── mcp-server.js     # Main CLI entry point
├── src/                  # Source code
│   ├── index.ts          # Main server implementation
│   ├── config.ts         # Configuration management
│   └── logger.ts         # Logging utilities
├── dist/                 # Compiled JavaScript
├── test-*.js             # Test utilities
└── build.js              # Build script
```

## Debugging

The server outputs debug logs to both stderr and a log file (`mcp-server-debug.log`). To see these logs:

1. In development mode:
   - Logs appear in the terminal running `inspect-watch`
   - Check the log file with `tail -f mcp-server-debug.log`
   - Use `node monitor-logs.js` to watch the log file
   
2. When running directly:
   ```bash
   npm run inspect 2>debug.log
   ```

## MCP Protocol

This server implements the Model Context Protocol (MCP) version 0.4.0. It registers tools based on the OpenAPI specification and handles tool execution requests using the `tools/call` method.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting:
   ```bash
   npm run typecheck
   npm run lint
   ```
5. Submit a pull request

## Testing

The repository includes several testing tools:

### test-server.js

Starts the server with logging enabled:

```bash
node test-server.js
```

### test-request.js

Simulates an MCP tool call request:

```bash
node test-request.js
```

### monitor-logs.js

Monitors the server log file:

```bash
node monitor-logs.js
```

## How It Works

1. The server parses the OpenAPI specification and registers each endpoint as an MCP tool
2. When a tool is called, the server:
   - Maps the parameters from the MCP request to the API request format
   - Handles nested request body structures based on the OpenAPI schema
   - Applies default values from environment variables if needed
   - Makes the API request to the specified endpoint
   - Returns the response to the MCP client

### Parameter Mapping

The server supports two parameter formats:

1. **Flat format** (backward compatible):
   ```json
   {
     "service_id": "translation_service",
     "params_source_lang": "English",
     "params_target_lang": "Spanish"
   }
   ```

2. **Nested format** (recommended):
   ```json
   {
     "service": {
       "id": "translation_service"
     },
     "params": {
       "source_lang": "English",
       "target_lang": "Spanish"
     }
   }
   ```

The server will automatically detect the format and handle it appropriately.

## Known Issues

- Some complex OpenAPI features may not be fully supported
- Error handling for certain edge cases could be improved

## License

MIT
