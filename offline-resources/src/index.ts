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
import sqlite3 from 'sqlite3';
import * as fs from 'fs-extra';
import * as path from 'path';
import NodeCache from 'node-cache';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface Resource {
  id: string;
  name: string;
  type: string;
  path: string;
  size: number;
  created_at?: string;
  updated_at?: string;
}

class OfflineResourcesServer {
  private server: Server;
  private db: sqlite3.Database;
  private cache: NodeCache;
  private resourcesDir: string;

  constructor() {
    this.server = new Server(
      {
        name: 'offline-resources',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.resourcesDir = path.join(process.cwd(), 'resources');
    fs.ensureDirSync(this.resourcesDir);

    this.db = new sqlite3.Database('resources.db');
    this.setupDatabase();

    this.cache = new NodeCache({ stdTTL: 300 }); // 5 minutos de TTL
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      this.db.close();
      process.exit(0);
    });
  }

  private setupDatabase() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS resources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          path TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'store_resource',
          description: 'Armazena um recurso offline',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do recurso'
              },
              type: {
                type: 'string',
                description: 'Tipo do recurso'
              },
              content: {
                type: 'string',
                description: 'Conteúdo do recurso em base64'
              }
            },
            required: ['name', 'type', 'content']
          }
        },
        {
          name: 'get_resource',
          description: 'Obtém um recurso armazenado',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'ID do recurso'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'list_resources',
          description: 'Lista recursos armazenados',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Filtrar por tipo'
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'store_resource': {
          const { name, type, content } = request.params.arguments as {
            name: string;
            type: string;
            content: string;
          };

          try {
            const id = Buffer.from(name + Date.now()).toString('hex');
            const filePath = path.join(this.resourcesDir, id);

            await fs.writeFile(filePath, Buffer.from(content, 'base64'));
            const stats = await fs.stat(filePath);

            return new Promise<any>((resolve, reject) => {
              this.db.run(
                'INSERT INTO resources (id, name, type, path, size) VALUES (?, ?, ?, ?, ?)',
                id, name, type, filePath, stats.size,
                (err) => {
                  if (err) reject(err);
                  else resolve({
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify({ id, name, type, size: stats.size })
                      }
                    ]
                  });
                }
              );
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao armazenar recurso: ${error}`
            );
          }
        }

        case 'get_resource': {
          const { id } = request.params.arguments as { id: string };

          try {
            const cached = this.cache.get<string>(id);
            if (cached) {
              return {
                content: [
                  {
                    type: 'text',
                    text: cached
                  }
                ]
              };
            }

            return new Promise<any>((resolve, reject) => {
              this.db.get(
                'SELECT * FROM resources WHERE id = ?',
                id,
                async (err, resource: Resource | undefined) => {
                  if (err) reject(err);
                  else if (!resource) {
                    throw new McpError(
                      ErrorCode.InternalError,
                      `Recurso não encontrado: ${id}`
                    );
                  } else {
                    try {
                      const content = await fs.readFile(resource.path, { encoding: 'base64' });
                      this.cache.set(id, content);
                      resolve({
                        content: [
                          {
                            type: 'text',
                            text: content
                          }
                        ]
                      });
                    } catch (error) {
                      reject(error);
                    }
                  }
                }
              );
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao obter recurso: ${error}`
            );
          }
        }

        case 'list_resources': {
          const { type } = request.params.arguments as { type?: string };

          try {
            const query = type
              ? 'SELECT * FROM resources WHERE type = ?'
              : 'SELECT * FROM resources';
            const params = type ? [type] : [];

            return new Promise<any>((resolve, reject) => {
              this.db.all(query, params[0], (err, resources: Resource[]) => {
                if (err) reject(err);
                else resolve({
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(resources, null, 2)
                    }
                  ]
                });
              });
            });
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao listar recursos: ${error}`
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
    logger.info('Offline Resources MCP server running on stdio');
  }
}

const server = new OfflineResourcesServer();
server.run().catch(logger.error);
