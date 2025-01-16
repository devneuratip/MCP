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
import * as stackTrace from 'stack-trace';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

class ErrorHandlerServer {
  private server: Server;
  private errorHistory: ErrorReport[] = [];

  constructor() {
    this.server = new Server(
      {
        name: 'error-handler',
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
          name: 'report_error',
          description: 'Reporta um erro para análise e tratamento',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Mensagem de erro'
              },
              stack: {
                type: 'string',
                description: 'Stack trace do erro (opcional)'
              },
              context: {
                type: 'object',
                description: 'Contexto adicional do erro (opcional)',
                additionalProperties: true
              }
            },
            required: ['message']
          }
        },
        {
          name: 'get_error_history',
          description: 'Obtém histórico de erros reportados',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Número máximo de erros para retornar',
                minimum: 1
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'report_error': {
          const { message, stack, context } = request.params.arguments as {
            message: string;
            stack?: string;
            context?: Record<string, unknown>;
          };

          const errorReport: ErrorReport = {
            message,
            stack: stack || stackTrace.get().map(callSite => callSite.toString()).join('\n'),
            timestamp: new Date().toISOString(),
            context
          };

          this.errorHistory.push(errorReport);
          logger.error('Erro reportado:', errorReport);

          return {
            content: [
              {
                type: 'text',
                text: 'Erro registrado com sucesso'
              }
            ]
          };
        }

        case 'get_error_history': {
          const { limit = 10 } = request.params.arguments as { limit?: number };
          const recentErrors = this.errorHistory.slice(-limit);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(recentErrors, null, 2)
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
    logger.info('Error Handler MCP server running on stdio');
  }
}

const server = new ErrorHandlerServer();
server.run().catch(logger.error);