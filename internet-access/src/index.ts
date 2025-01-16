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
import axios from 'axios';
import * as cheerio from 'cheerio';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class InternetAccessServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'internet-access',
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
          name: 'fetch_url',
          description: 'Busca o conteúdo de uma URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL para buscar'
              },
              parseHtml: {
                type: 'boolean',
                description: 'Se deve extrair texto do HTML',
                default: false
              }
            },
            required: ['url']
          }
        },
        {
          name: 'search_web',
          description: 'Realiza uma busca na web',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Termo de busca'
              },
              limit: {
                type: 'number',
                description: 'Número máximo de resultados',
                default: 5
              }
            },
            required: ['query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'fetch_url': {
          const { url, parseHtml = false } = request.params.arguments as {
            url: string;
            parseHtml?: boolean;
          };

          try {
            const response = await axios.get(url);
            let content = response.data;

            if (parseHtml && typeof content === 'string') {
              const $ = cheerio.load(content);
              // Remove scripts, styles e comentários
              $('script, style, comment').remove();
              content = $('body').text().trim().replace(/\s+/g, ' ');
            }

            return {
              content: [
                {
                  type: 'text',
                  text: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                }
              ]
            };
          } catch (error) {
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Erro ao buscar URL: ${error.message}`
              );
            }
            throw error;
          }
        }

        case 'search_web': {
          const { query, limit = 5 } = request.params.arguments as {
            query: string;
            limit?: number;
          };

          try {
            // Aqui você pode integrar com uma API de busca real
            // Por enquanto, retornamos um exemplo
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: 'Funcionalidade de busca em desenvolvimento',
                    query,
                    limit
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao realizar busca: ${error}`
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
    logger.info('Internet Access MCP server running on stdio');
  }
}

const server = new InternetAccessServer();
server.run().catch(logger.error);