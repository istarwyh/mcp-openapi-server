// @ts-ignore
import { createTransport } from "@smithery/sdk/transport.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { setTimeout } from 'node:timers/promises';

describe('Smithery Integration Tests', () => {
  let transport: any;
  let client: Client;

  beforeEach(async () => {
    transport = createTransport("https://server.smithery.ai/@smithery-ai/server-sequential-thinking", {});
    client = new Client({
      name: "Test client",
      version: "1.0.0"
    });
  });

  describe('Server Connection', () => {
    it('should successfully connect to Smithery server and list tools', async () => {
      await client.connect(transport);
      const { tools } = await client.listTools();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      const toolNames = tools.map((t: { name: string }) => t.name);
      console.log(`Available tools: ${toolNames.join(", ")}`);
    }, 1000000); // Increased timeout for real API call

    it('should handle server unavailability', async () => {
      const invalidTransport = createTransport("https://invalid.server.url", {});
      const testClient = new Client({
        name: "Test client",
        version: "1.0.0"
      });

      await expect(testClient.connect(invalidTransport)).rejects.toThrow();
    });
  });
});
