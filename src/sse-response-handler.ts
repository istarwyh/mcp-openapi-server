import { AxiosResponse } from "axios";
import { ExtendedTool, toolErrorResponse, toolSuccessResponse } from "./types.js";
import { log } from "./logger.js";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { extractContentFromQuotes, extractTextFromQuotes } from "./utils.js";

export function parseSSEEvent(chunk: string): string {
  if (!chunk.startsWith("data:"))
    return chunk;
  return chunk.slice(5).trim();
}
// 将SSE 转成 Stdio,避免改造服务器端
export async function handleSSEResponse(
  response: AxiosResponse
): Promise<CallToolResult> {
  const stream: string = response.data;
  const textChunks: string[] = extractTextFromQuotes(stream);
  const contentChunks: string[] = extractContentFromQuotes(stream);
  const lines: string[] = stream.trim().split('\n\n');
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
      } catch (error) {
        log("Error processing SSE chunk", error);
        reject(toolErrorResponse(error instanceof Error ? error.message : String(error)));
      }
    });
    resolve(toolSuccessResponse(allText));
  });
}