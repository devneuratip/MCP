declare module 'brain.js' {
  export class NeuralNetwork {
    constructor(options?: any);
    train(data: any[], options?: any): void;
    run(input: any): any;
    toJSON(): any;
    fromJSON(json: any): void;
  }
}

declare module '@modelcontextprotocol/sdk/server/index.js' {
  export class Server {
    constructor(info: any, options: any);
    connect(transport: any): Promise<void>;
    setRequestHandler(schema: any, handler: any): void;
    onerror: (error: Error) => void;
    close(): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor();
  }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export const CallToolRequestSchema: any;
  export const ListToolsRequestSchema: any;
  export const ErrorCode: {
    MethodNotFound: string;
    InternalError: string;
  };
  export class McpError extends Error {
    constructor(code: string, message: string);
  }
}

declare module 'natural' {
  export class WordTokenizer {
    tokenize(text: string): string[] | null;
  }
  export class BayesClassifier {
    addDocument(text: string, label: string): void;
    train(): void;
    getClassifications(text: string): Array<{label: string; value: number}>;
  }
}

declare module 'winston' {
  export interface LoggerOptions {
    level?: string;
    format?: any;
    transports?: any[];
  }

  export interface TransportOptions {
    filename?: string;
    level?: string;
    format?: any;
  }

  export class Logger {
    constructor(options: LoggerOptions);
    info(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
  }

  export const format: {
    combine(...formats: any[]): any;
    timestamp(): any;
    json(): any;
    colorize(): any;
    simple(): any;
  };

  export class transports {
    static File: new (options: TransportOptions) => any;
    static Console: new (options: TransportOptions) => any;
  }

  export function createLogger(options: LoggerOptions): Logger;
}

declare module 'node-cache' {
  interface Options {
    stdTTL?: number;
    checkperiod?: number;
  }

  class NodeCache {
    constructor(options?: Options);
    set(key: string, value: any, ttl?: number): boolean;
    get(key: string): any;
    del(key: string): number;
    keys(): string[];
    has(key: string): boolean;
    flushAll(): void;
  }

  export = NodeCache;
}