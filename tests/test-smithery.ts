
import { createTransport } from "@smithery/sdk/transport.js"
import { setTimeout } from 'node:timers/promises'

async function runTests() {
  try {
    console.log('Creating transport...')
    let transport
    try {
      transport = createTransport("https://server.smithery.ai/@smithery-ai/server-sequential-thinking", {})
      console.log('Transport created')
    } catch (error) {
      console.log('Skipping test - Smithery server unavailable')
      process.exit(0)
    }

    // Create MCP client
    console.log('Importing Client...')
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
    console.log('Client imported')
    
    console.log('Creating client instance...')
    const client = new Client({
      name: "Test client",
      version: "1.0.0"
    })
    console.log('Client instance created')

    // Add timeout for connection
    try {
      await Promise.race([
        client.connect(transport),
        setTimeout(5000, new Error('Connection timed out after 5 seconds'))
      ])
    } catch (error) {
      console.log('Skipping test - Could not connect to Smithery server')
      process.exit(0)
    }

    // Use the server tools with your LLM application
    const { tools } = await client.listTools()
    console.log('Tools response:', tools)
    if (!Array.isArray(tools)) {
      throw new Error(`Expected tools to be an array, got ${typeof tools}: ${JSON.stringify(tools)}`)
    }
    const toolNames = tools.map((t: { name: string }) => t.name)
    console.log(`Available tools: ${toolNames.join(", ")}`)
    process.exit(0)
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

runTests()

// Example: Call a tool
// const result = await client.callTool("tool_name", { param1: "value1" })
