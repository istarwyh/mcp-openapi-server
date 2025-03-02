
import axios, { AxiosResponse } from "axios";
import { OpenAPIV3 } from "openapi-types";
import { ExtendedTool, RequestConfig } from "./types.js";
import { log } from "./logger.js";
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ErrorCode, JSONRPCMessage, McpError, SamplingMessage, SamplingMessageSchema } from '@modelcontextprotocol/sdk/types.js';

export function parseSSEEvent(chunk: string): string{
  return chunk.slice(5).trim();
}

export async function handleSSEResponse(
  tool: ExtendedTool,
  response: AxiosResponse
): Promise<SamplingMessage> {
  const stream:string = response.data;
  const lines: string[] = stream.split('\n\n');
  
  return new Promise((resolve, reject) => {
    lines.forEach((chunk: string) => {
      try {
        const rawChunk = chunk.toString();
        log("Received SSE chunk",rawChunk);

        const event:string = parseSSEEvent(rawChunk);
        resolve({
            role:"assistant",
            content:[{
              type:"text",
              text:event
            }]
        });
      } catch (error) {
        log("Error processing SSE chunk",error);
        reject(new McpError(ErrorCode.InternalError, error.message));
      }
    });

  });
}

export function createSendEvent(transport: SSEServerTransport): (event: any) => void {
  return (event) => {
    try {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: event.method, 
        params: {
          type: event.event || 'message',
          data: event.data,
          id: event.id,
          timestamp: event.timestamp
        }
      };
      transport.send(message);
    } catch (error) {
      console.error('Failed to send SSE event:', error);
      
      // 发送错误消息
      const errorMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: event.method,
        params: {
          type: 'error',
          error: {
            message: error.message,
            code: 'SSE_SEND_ERROR'
          },
          id: event.id,
          timestamp: new Date().toISOString()
        }
      };
      
      transport.send(errorMessage);
    }
  };
}