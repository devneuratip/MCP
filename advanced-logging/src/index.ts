#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

interface LogEventArgs {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
}

function isLogEventArgs(args: unknown): args is LogEventArgs {
  if (typeof args !== 'object' || args === null) return false;
  const obj = args as Record<string, unknown>;
  return (
    typeof obj.level === 'string' &&
    ['info', 'warn', 'error', 'debug'].includes(obj.level) &&
    typeof obj.message === 'string' &&
    (obj.metadata === undefined || typeof obj.metadata === 'object')
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/mcp-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

class AdvancedLoggingServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'advanced-logging',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => {
      logger.error('MCP Server Error', { error: error.message, stack: error.stack });
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'log_event',
          description: 'Registra um evento no sistema de logging',
          inputSchema: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['info', 'warn', 'error', 'debug'],
                description: 'Nível do log'
              },
              message: {
                type: 'string',
                description: 'Mensagem do evento'
              },
              metadata: {
                type: 'object',
                description: 'Metadados adicionais do evento',
                additionalProperties: true
              }
            },
            required: ['level', 'message']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'log_event') {
        if (!isLogEventArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Argumentos inválidos para log_event'
          );
        }

        const { level, message, metadata = {} } = request.params.arguments;
        logger.log(level, message, metadata);

        return {
          content: [
            {
              type: 'text',
              text: `Evento registrado com sucesso: [${level}] ${message}`
            }
          ]
        };
      }

      throw new McpError(
        ErrorCode.MethodNotFound,
        `Ferramenta desconhecida: ${request.params.name}`
      );
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Servidor Advanced Logging MCP iniciado');
  }
}

const server = new AdvancedLoggingServer();
server.run().catch((error) => {
  logger.error('Erro fatal ao iniciar o servidor', { error: error.message, stack: error.stack });
  process.exit(1);
});