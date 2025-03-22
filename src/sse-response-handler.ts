
import axios, { AxiosResponse } from "axios";
import { OpenAPIV3 } from "openapi-types";
import { ExtendedTool, RequestConfig } from "./types.js";
import { log } from "./logger.js";
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ErrorCode, JSONRPCMessage, McpError, SamplingMessage, SamplingMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { extractContentFromQuotes, extractTextFromQuotes } from "./utils.js";

export function parseSSEEvent(chunk: string): string {
  if (!chunk.startsWith("data:"))
    return chunk;
  return chunk.slice(5).trim();
}
// 权宜之计，真的SSE连接暂时不知道
export async function handleSSEResponse(
  tool: ExtendedTool,
  response: AxiosResponse
): Promise<SamplingMessage> {
  const stream: string = response.data;
  const textChunks: string[] = extractTextFromQuotes(stream);
  const contentChunks: string[] = extractContentFromQuotes(stream);
  const lines: string[] = stream.trim().split('\n\n');
  const contentArray: any[] = []
  let chunks = textChunks;
  if (textChunks.length > 0) {
    chunks = textChunks;
  } else if (contentChunks.length > 0) {
    chunks = contentChunks;
  } else {
    chunks = lines;
  }
  let allText = '';
  return new Promise((resolve, reject) => {
    chunks.forEach((chunk: string) => {
      try {
        const rawChunk = chunk.toString();
        if (rawChunk.trim() === "") return;
        log("Received SSE chunk", rawChunk);
        const event: string = parseSSEEvent(rawChunk);
        allText = allText + event;
        contentArray.push({
          type: "text",
          text: event
        })
      } catch (error: Error | unknown) {
        log("Error processing SSE chunk", error);
        reject(new McpError(ErrorCode.InternalError, error.message));
      }
    });
    resolve({
      role: "assistant",
      content: [{ type: 'text', text: allText }]
    });
  });
}