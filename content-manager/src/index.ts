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
import NodeCache from 'node-cache';
import { nanoid } from 'nanoid';
import { parse, stringify } from 'yaml';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class ContentManagerServer {
  private server: Server;
  private cache: NodeCache;

  constructor() {
    this.server = new Server(
      {
        name: 'content-manager',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 300 });
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
          name: 'parse_yaml',
          description: 'Converte uma string YAML em objeto JSON',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Conteúdo YAML para converter'
              }
            },
            required: ['content']
          }
        },
        {
          name: 'stringify_yaml',
          description: 'Converte um objeto JSON em string YAML',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'object',
                description: 'Objeto para converter em YAML'
              }
            },
            required: ['content']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'parse_yaml': {
          const { content } = request.params.arguments as { content: string };
          
          try {
            const result = parse(content);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao converter YAML: ${error}`
            );
          }
        }

        case 'stringify_yaml': {
          const { content } = request.params.arguments as { content: object };
          
          try {
            const result = stringify(content);
            return {
              content: [
                {
                  type: 'text',
                  text: result
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao converter para YAML: ${error}`
            );
          }
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
    logger.info('Content Manager MCP server running on stdio');
  }
}

const server = new ContentManagerServer();
server.run().catch(logger.error);