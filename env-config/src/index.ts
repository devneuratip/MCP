#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import dotenv from 'dotenv';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class EnvConfigServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'env-config',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_env',
          description: 'Obtém o valor de uma variável de ambiente',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Nome da variável de ambiente'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'set_env',
          description: 'Define o valor de uma variável de ambiente',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Nome da variável de ambiente'
              },
              value: {
                type: 'string',
                description: 'Valor da variável de ambiente'
              }
            },
            required: ['key', 'value']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'get_env': {
          const { key } = request.params.arguments as { key: string };
          const value = process.env[key];
          
          if (!value) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Variável de ambiente ${key} não encontrada`
            );
          }

          return {
            content: [
              {
                type: 'text',
                text: value
              }
            ]
          };
        }

        case 'set_env': {
          const { key, value } = request.params.arguments as { key: string; value: string };
          process.env[key] = value;

          return {
            content: [
              {
                type: 'text',
                text: `Variável ${key} definida com sucesso`
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
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Environment Config MCP server running on stdio');
  }
}

const server = new EnvConfigServer();
server.run().catch(logger.error);