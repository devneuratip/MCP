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
import { LRUCache } from 'lru-cache';
import QuickLRU from 'quick-lru';
import NodeCache from 'node-cache';
import * as cacheManager from 'cache-manager';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface CacheConfig {
  type: 'memory' | 'multi';
  ttl?: number;
  maxSize?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  size: number;
}

class SmartCacheServer {
  private server: Server;
  private memoryCache: LRUCache<string, any>;
  private quickCache: QuickLRU<string, any>;
  private nodeCache: NodeCache;
  private stats: Map<string, CacheStats>;

  constructor() {
    this.server = new Server(
      {
        name: 'smart-cache',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.memoryCache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 5 // 5 minutos
    });

    this.quickCache = new QuickLRU({
      maxSize: 1000
    });

    this.nodeCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60
    });

    this.stats = new Map();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private updateStats(cacheId: string, hit: boolean) {
    let stats = this.stats.get(cacheId);
    if (!stats) {
      stats = { hits: 0, misses: 0, keys: 0, size: 0 };
      this.stats.set(cacheId, stats);
    }
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
  }

  private async setInCache(cacheId: string, key: string, value: any, config: CacheConfig) {
    const stats = this.stats.get(cacheId);
    if (stats) {
      stats.keys++;
      stats.size += Buffer.from(JSON.stringify(value)).length;
    }

    switch (config.type) {
      case 'memory':
        this.memoryCache.set(key, value, {
          ttl: config.ttl ? config.ttl * 1000 : undefined
        });
        break;

      case 'multi':
        // Armazena em múltiplas camadas
        this.quickCache.set(key, value);
        if (config.ttl) {
          this.nodeCache.set(key, value, config.ttl);
        } else {
          this.nodeCache.set(key, value);
        }
        break;
    }
  }

  private async getFromCache(cacheId: string, key: string, config: CacheConfig): Promise<any> {
    let value: any;

    switch (config.type) {
      case 'memory':
        value = this.memoryCache.get(key);
        break;

      case 'multi':
        // Tenta obter da camada mais rápida para a mais lenta
        value = this.quickCache.get(key);
        if (!value) {
          value = this.nodeCache.get(key);
        }
        break;
    }

    this.updateStats(cacheId, !!value);
    return value;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_cache',
          description: 'Cria uma nova instância de cache',
          inputSchema: {
            type: 'object',
            properties: {
              cacheId: {
                type: 'string',
                description: 'Identificador único do cache'
              },
              config: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['memory', 'multi'],
                    description: 'Tipo de cache'
                  },
                  ttl: {
                    type: 'number',
                    description: 'Tempo de vida em segundos'
                  },
                  maxSize: {
                    type: 'number',
                    description: 'Tamanho máximo do cache'
                  }
                },
                required: ['type']
              }
            },
            required: ['cacheId', 'config']
          }
        },
        {
          name: 'set_cache',
          description: 'Armazena um valor no cache',
          inputSchema: {
            type: 'object',
            properties: {
              cacheId: {
                type: 'string',
                description: 'ID do cache'
              },
              key: {
                type: 'string',
                description: 'Chave do valor'
              },
              value: {
                type: 'any',
                description: 'Valor a ser armazenado'
              }
            },
            required: ['cacheId', 'key', 'value']
          }
        },
        {
          name: 'get_cache',
          description: 'Obtém um valor do cache',
          inputSchema: {
            type: 'object',
            properties: {
              cacheId: {
                type: 'string',
                description: 'ID do cache'
              },
              key: {
                type: 'string',
                description: 'Chave do valor'
              }
            },
            required: ['cacheId', 'key']
          }
        },
        {
          name: 'get_stats',
          description: 'Obtém estatísticas do cache',
          inputSchema: {
            type: 'object',
            properties: {
              cacheId: {
                type: 'string',
                description: 'ID do cache'
              }
            },
            required: ['cacheId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_cache': {
          const { cacheId, config } = request.params.arguments as {
            cacheId: string;
            config: CacheConfig;
          };

          try {
            this.stats.set(cacheId, {
              hits: 0,
              misses: 0,
              keys: 0,
              size: 0
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ cacheId, config }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao criar cache: ${error}`
            );
          }
        }

        case 'set_cache': {
          const { cacheId, key, value } = request.params.arguments as {
            cacheId: string;
            key: string;
            value: any;
          };

          try {
            const config = {
              type: 'memory' as const,
              ttl: 300
            };

            await this.setInCache(cacheId, key, value, config);

            return {
              content: [
                {
                  type: 'text',
                  text: `Value stored in cache ${cacheId} with key ${key}`
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao armazenar no cache: ${error}`
            );
          }
        }

        case 'get_cache': {
          const { cacheId, key } = request.params.arguments as {
            cacheId: string;
            key: string;
          };

          try {
            const config = {
              type: 'memory' as const
            };

            const value = await this.getFromCache(cacheId, key, config);

            return {
              content: [
                {
                  type: 'text',
                  text: value ? JSON.stringify(value, null, 2) : 'Cache miss'
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao obter do cache: ${error}`
            );
          }
        }

        case 'get_stats': {
          const { cacheId } = request.params.arguments as {
            cacheId: string;
          };

          const stats = this.stats.get(cacheId);
          if (!stats) {
            throw new McpError(
              ErrorCode.InternalError,
              `Cache não encontrado: ${cacheId}`
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
    logger.info('Smart Cache MCP server running on stdio');
  }
}

const server = new SmartCacheServer();
server.run().catch(logger.error);
