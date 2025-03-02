
import axios, { AxiosResponse } from "axios";
import { OpenAPIV3 } from "openapi-types";
import { ExtendedTool, RequestConfig } from "./types.js";
import { log } from "./logger.js";
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ErrorCode, JSONRPCMessage, McpError, SamplingMessage, SamplingMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { extractIteratorFromQuotes, extractTextFromQuotes } from "./utils.js";

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
  const iteratorChunks: string[] = extractIteratorFromQuotes(stream);
  const lines: string[] = stream.trim().split('\n\n');
  const contentArray: any[] = []
  let chunks = textChunks;
  if (textChunks.length > 0) {
    chunks = textChunks;
  } else if (iteratorChunks.length > 0) {
    chunks = iteratorChunks;
  } else {
    chunks = lines;
  }
  return new Promise((resolve, reject) => {
    chunks.forEach((chunk: string) => {
      try {
        const rawChunk = chunk.toString();
        if (rawChunk.trim() === "") return;
        log("Received SSE chunk", rawChunk);
        const event: string = parseSSEEvent(rawChunk);
        contentArray.push({
          type: "text",
          text: event
        })
      } catch (error) {
        log("Error processing SSE chunk", error);
        reject(new McpError(ErrorCode.InternalError, error.message));
      }
    });
    resolve({
      role: "assistant",
      content: contentArray
    });
  });
}