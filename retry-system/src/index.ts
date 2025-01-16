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
import retry from 'retry';
import pRetry from 'p-retry';
import pTimeout from 'p-timeout';
import NodeCache from 'node-cache';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface RetryConfig {
  retries: number;
  factor: number;
  minTimeout: number;
  maxTimeout: number;
  randomize: boolean;
}

interface RetryStats {
  operationId: string;
  attempts: number;
  success: boolean;
  totalTime: number;
  error?: string;
}

class RetrySystemServer {
  private server: Server;
  private cache: NodeCache;
  private stats: Map<string, RetryStats>;

  constructor() {
    this.server = new Server(
      {
        name: 'retry-system',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.stats = new Map();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private getDefaultConfig(): RetryConfig {
    return {
      retries: 5,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 60000,
      randomize: true
    };
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    operationId: string
  ): Promise<T> {
    const startTime = Date.now();
    const stats: RetryStats = {
      operationId,
      attempts: 0,
      success: false,
      totalTime: 0
    };

    try {
      const result = await pRetry(
        async () => {
          stats.attempts++;
          try {
            const timeoutPromise = pTimeout(
              operation(),
              { milliseconds: config.maxTimeout }
            );
            return await timeoutPromise;
          } catch (error) {
            logger.warn(`Retry attempt ${stats.attempts} failed:`, error);
            throw error;
          }
        },
        {
          retries: config.retries,
          factor: config.factor,
          minTimeout: config.minTimeout,
          maxTimeout: config.maxTimeout,
          randomize: config.randomize,
          onFailedAttempt: error => {
            logger.warn(
              `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
            );
          }
        }
      );

      stats.success = true;
      return result;
    } catch (error) {
      stats.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      stats.totalTime = Date.now() - startTime;
      this.stats.set(operationId, stats);
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'execute_with_retry',
          description: 'Executa uma operação com política de retentativas',
          inputSchema: {
            type: 'object',
            properties: {
              operationId: {
                type: 'string',
                description: 'Identificador único da operação'
              },
              operation: {
                type: 'string',
                description: 'Operação a ser executada (código JavaScript)'
              },
              config: {
                type: 'object',
                description: 'Configuração de retentativas',
                properties: {
                  retries: {
                    type: 'number',
                    description: 'Número máximo de tentativas'
                  },
                  factor: {
                    type: 'number',
                    description: 'Fator de multiplicação do tempo entre tentativas'
                  },
                  minTimeout: {
                    type: 'number',
                    description: 'Tempo mínimo entre tentativas (ms)'
                  },
                  maxTimeout: {
                    type: 'number',
                    description: 'Tempo máximo entre tentativas (ms)'
                  },
                  randomize: {
                    type: 'boolean',
                    description: 'Randomizar tempo entre tentativas'
                  }
                }
              }
            },
            required: ['operationId', 'operation']
          }
        },
        {
          name: 'get_retry_stats',
          description: 'Obtém estatísticas de retentativas',
          inputSchema: {
            type: 'object',
            properties: {
              operationId: {
                type: 'string',
                description: 'ID da operação'
              }
            },
            required: ['operationId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'execute_with_retry': {
          const { operationId, operation, config = {} } = request.params.arguments as {
            operationId: string;
            operation: string;
            config?: Partial<RetryConfig>;
          };

          try {
            const retryConfig = {
              ...this.getDefaultConfig(),
              ...config
            };

            // Criar função a partir da string de operação
            const operationFn = new Function(`return ${operation}`)() as () => Promise<any>;

            const result = await this.executeWithRetry(
              operationFn,
              retryConfig,
              operationId
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao executar operação: ${error}`
            );
          }
        }

        case 'get_retry_stats': {
          const { operationId } = request.params.arguments as {
            operationId: string;
          };

          const stats = this.stats.get(operationId);
          if (!stats) {
            throw new McpError(
              ErrorCode.InternalError,
              `Estatísticas não encontradas para operação: ${operationId}`
            );
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(stats, null, 2)
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
    logger.info('Retry System MCP server running on stdio');
  }
}

const server = new RetrySystemServer();
server.run().catch(logger.error);