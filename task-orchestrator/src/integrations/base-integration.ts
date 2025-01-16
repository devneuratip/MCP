import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface McpRequestOptions {
  method: string;
  params: Record<string, unknown>;
}

export abstract class BaseIntegration {
  constructor(protected server: Server) {}

  protected async makeRequest<T>(options: McpRequestOptions): Promise<T | null> {
    try {
      const request = {
        method: options.method,
        params: { ...options.params, _meta: {} }
      };

      // Usando any temporariamente para contornar as limitações do tipo
      const response = await (this.server as any).request(request, request);

      if (!response || !('content' in response) || !Array.isArray(response.content)) {
        return null;
      }

      const content = response.content[0]?.text;
      if (!content) {
        return null;
      }

      return JSON.parse(content) as T;
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        return null;
      }
      throw error;
    }
  }

  protected async makeRequests<T>(requests: McpRequestOptions[]): Promise<(T | null)[]> {
    return Promise.all(
      requests.map(request => this.makeRequest<T>(request))
    );
  }

  protected handleError(error: unknown, context: string): never {
    console.error(`Erro em ${context}:`, error);
    
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Falha em ${context}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}