import { EventEmitter } from 'events';
import { createInterface } from 'readline';

export class Server extends EventEmitter {
  private handlers: Map<string, (request: any) => Promise<any>> = new Map();

  constructor(
    private info: { name: string; version: string },
    private config: { capabilities: { tools: Record<string, unknown> } }
  ) {
    super();
  }

  setRequestHandler(schema: any, handler: (request: any) => Promise<any>) {
    this.handlers.set(schema.properties.method.enum[0], handler);
  }

  async handleRequest(request: any) {
    if (request.method === 'initialize') {
      return {
        info: this.info,
        capabilities: this.config.capabilities
      };
    }

    const handler = this.handlers.get(request.method);
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown method: ${request.method}`
      );
    }

    try {
      return await handler(request);
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Error processing request: ${error.message}`
      );
    }
  }

  async connect() {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;

      try {
        const request = JSON.parse(line);
        const response = await this.handleRequest(request);
        console.log(JSON.stringify(response));
      } catch (error: any) {
        console.log(JSON.stringify({
          error: {
            code: error.code || ErrorCode.InternalError,
            message: error.message
          }
        }));
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });

    process.on('SIGINT', () => {
      rl.close();
      process.exit(0);
    });
  }
}

export const ListToolsRequestSchema = {
  type: 'object',
  properties: {
    method: { type: 'string', enum: ['list_tools'] },
    params: { type: 'object' }
  }
};

export const CallToolRequestSchema = {
  type: 'object',
  properties: {
    method: { type: 'string', enum: ['call_tool'] },
    params: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        arguments: { type: 'object' }
      },
      required: ['name', 'arguments']
    }
  }
};

export enum ErrorCode {
  ParseError = 'PARSE_ERROR',
  InvalidRequest = 'INVALID_REQUEST',
  MethodNotFound = 'METHOD_NOT_FOUND',
  InvalidParams = 'INVALID_PARAMS',
  InternalError = 'INTERNAL_ERROR'
}

export class McpError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'McpError';
  }
}