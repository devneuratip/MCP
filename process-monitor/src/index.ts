#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import psList from 'ps-list';
import findProcess from 'find-process';

class ProcessMonitor {
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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_processes',
          description: 'Lista todos os processos em execução',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'find_process',
          description: 'Procura um processo específico',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do processo'
              }
            },
            required: ['name']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'list_processes': {
            const processes = await psList();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(processes, null, 2)
                }
              ]
            };
          }
          case 'find_process': {
            const { name } = request.params.arguments as { name: string };
            const processes = await findProcess('name', name);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(processes, null, 2)
                }
              ]
            };
          }
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Ferramenta desconhecida: ${request.params.name}`
            );
        }
      } catch (error: any) {
        console.error('Erro ao executar ferramenta:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Erro ao executar ferramenta: ${error.message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Process Monitor MCP server running on stdio');
  }
}

const monitor = new ProcessMonitor();
monitor.run().catch((error) => {
  console.error('Erro fatal no servidor:', error);
  process.exit(1);
});