#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

interface SyncFile {
  path: string;
  content: string;
  timestamp: number;
}

class CloudSyncServer {
  private server: Server;
  private syncedFiles: Map<string, SyncFile>;

  constructor() {
    this.server = new Server(
      {
        name: 'cloud-sync',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.syncedFiles = new Map();
    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'upload_file',
          description: 'Upload a file to cloud storage',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path of the file to upload',
              },
              content: {
                type: 'string',
                description: 'Content of the file',
              },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'download_file',
          description: 'Download a file from cloud storage',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path of the file to download',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'list_files',
          description: 'List all synced files',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'upload_file':
          return this.handleUploadFile(request.params.arguments);
        case 'download_file':
          return this.handleDownloadFile(request.params.arguments);
        case 'list_files':
          return this.handleListFiles();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleUploadFile(args: any) {
    if (!args.path || !args.content) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Missing required parameters: path and content'
      );
    }

    this.syncedFiles.set(args.path, {
      path: args.path,
      content: args.content,
      timestamp: Date.now(),
    });

    return {
      content: [
        {
          type: 'text',
          text: `File ${args.path} uploaded successfully`,
        },
      ],
    };
  }

  private async handleDownloadFile(args: any) {
    if (!args.path) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Missing required parameter: path'
      );
    }

    const file = this.syncedFiles.get(args.path);
    if (!file) {
      throw new McpError(
        ErrorCode.InternalError,
        `File not found: ${args.path}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: file.content,
        },
      ],
    };
  }

  private async handleListFiles() {
    const files = Array.from(this.syncedFiles.values()).map(
      (file) => ({
        path: file.path,
        timestamp: new Date(file.timestamp).toISOString(),
      })
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(files, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Cloud Sync MCP server running on stdio');
  }
}

const server = new CloudSyncServer();
server.run().catch(console.error);