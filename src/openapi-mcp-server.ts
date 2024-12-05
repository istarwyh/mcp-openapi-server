import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { OpenAPIV3 } from "openapi-types";
import axios from "axios";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Resource,
  TextResourceContents,
} from "@modelcontextprotocol/sdk/types";

interface OpenAPIMCPServerConfig {
  name: string;
  version: string;
  apiBaseUrl: string;
  openApiSpec: OpenAPIV3.Document;
  headers?: Record<string, string>;
}

export class OpenAPIMCPServer {
  private server: Server;
  private config: OpenAPIMCPServerConfig;
  private resources: Map<string, Resource> = new Map();

  constructor(config: OpenAPIMCPServerConfig) {
    this.config = config;
    this.server = new Server({
      name: config.name,
      version: config.version,
    });

    this.initializeHandlers();
    this.parseOpenAPISpec();
  }

  private parseOpenAPISpec(): void {
    const spec = this.config.openApiSpec;

    // Convert each OpenAPI path to an MCP resource
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || !operation) continue; // Skip common parameters

        const op = operation as OpenAPIV3.OperationObject;
        const resourceUri = `openapi://${path}/${method}`;
        const resource: Resource = {
          uri: resourceUri,
          name: op.summary || `${method.toUpperCase()} ${path}`,
          description: op.description,
          mimeType: "application/json",
        };

        this.resources.set(resourceUri, resource);
      }
    }
  }

  private initializeHandlers(): void {
    // Handle resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Array.from(this.resources.values()),
      };
    });

    // Handle resource reading
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;
        const resource = this.resources.get(uri);

        if (!resource) {
          throw new Error(`Resource not found: ${uri}`);
        }

        // Parse the URI to get path and method
        const [, pathAndMethod] = uri.split("openapi://");
        const [path, method] = pathAndMethod.split("/");

        try {
          // Make the actual API call
          const response = await axios({
            method,
            url: `${this.config.apiBaseUrl}${path}`,
            headers: this.config.headers,
          });

          const contents: TextResourceContents = {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(response.data, null, 2),
          };

          return {
            contents: [contents],
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new Error(`API request failed: ${error.message}`);
          }
          throw error;
        }
      },
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
