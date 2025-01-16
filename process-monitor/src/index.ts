#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import findProcess from 'find-process';
import net from 'net';

interface ProcessStatus {
  running: boolean;
  pid?: number;
  port?: number;
}

class ProcessMonitorServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'process-monitor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.once('close', () => resolve(true)).close();
        })
        .listen(port);
    });
  }

  private async findProcessByName(name: string): Promise<ProcessStatus> {
    try {
      const processes = await findProcess('name', name);
      if (processes.length > 0) {
        return {
          running: true,
          pid: processes[0].pid
        };
      }
      return { running: false };
    } catch (error) {
      console.error(`Error finding process ${name}:`, error);
      return { running: false };
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_windsurf_status',
          description: 'Check if Windsurf is running',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          },
        },
        {
          name: 'get_cascade_status',
          description: 'Check if Cascade is running',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          },
        },
        {
          name: 'check_port',
          description: 'Check if a port is available',
          inputSchema: {
            type: 'object',
            properties: {
              port: {
                type: 'number',
                description: 'Port number to check'
              }
            },
            required: ['port']
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'get_windsurf_status': {
          const status = await this.findProcessByName('windsurf');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status }, null, 2),
              },
            ],
          };
        }

        case 'get_cascade_status': {
          const status = await this.findProcessByName('cascade');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status }, null, 2),
              },
            ],
          };
        }

        case 'check_port': {
          const { port } = request.params.arguments as { port: number };
          if (typeof port !== 'number') {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Port must be a number'
            );
          }
          const available = await this.checkPort(port);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ available }, null, 2),
              },
            ],
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Process Monitor MCP server running on stdio');
  }
}

const server = new ProcessMonitorServer();
server.run().catch(console.error);