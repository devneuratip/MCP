declare module '@modelcontextprotocol/sdk/server/index.js' {
  export class Server {
    constructor(
      info: { name: string; version: string },
      config: { capabilities: { tools: Record<string, unknown> } }
    );
    setRequestHandler(schema: any, handler: (request: any) => Promise<any>): void;
    connect(transport: any): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor();
    connect(): Promise<void>;
    close(): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export const ListToolsRequestSchema: {
    type: 'object';
    properties: {
      method: { type: 'string'; enum: ['list_tools'] };
      params: { type: 'object' };
    };
  };

  export const CallToolRequestSchema: {
    type: 'object';
    properties: {
      method: { type: 'string'; enum: ['call_tool'] };
      params: {
        type: 'object';
        properties: {
          name: { type: 'string' };
          arguments: { type: 'object' };
        };
        required: ['name', 'arguments'];
      };
    };
  };

  export enum ErrorCode {
    ParseError = 'PARSE_ERROR',
    InvalidRequest = 'INVALID_REQUEST',
    MethodNotFound = 'METHOD_NOT_FOUND',
    InvalidParams = 'INVALID_PARAMS',
    InternalError = 'INTERNAL_ERROR'
  }

  export class McpError extends Error {
    constructor(code: ErrorCode, message: string);
    code: ErrorCode;
  }

  export interface Message {
    type: 'system' | 'message';
    content: string;
    role: 'system' | 'user' | 'assistant';
  }
}