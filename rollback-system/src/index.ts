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
import * as fs from 'fs-extra';
import * as path from 'path';
import * as diff from 'diff';
import { simpleGit, SimpleGit } from 'simple-git';
import NodeCache from 'node-cache';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface BackupFile {
  path: string;
  content: string;
}

interface RollbackPoint {
  id: string;
  timestamp: string;
  description: string;
  files: BackupFile[];
}

class RollbackSystemServer {
  private server: Server;
  private cache: NodeCache;
  private rollbackPoints: Map<string, RollbackPoint>;
  private git: SimpleGit;
  private backupDir: string;

  constructor() {
    this.server = new Server(
      {
        name: 'rollback-system',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.rollbackPoints = new Map();
    this.git = simpleGit();
    this.backupDir = path.join(process.cwd(), 'backups');
    fs.ensureDirSync(this.backupDir);

    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async createBackup(files: string[]): Promise<RollbackPoint> {
    const id = Buffer.from(Date.now().toString()).toString('hex');
    const timestamp = new Date().toISOString();
    const backupFiles: BackupFile[] = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const backupPath = path.join(this.backupDir, `${id}_${path.basename(filePath)}`);
        await fs.writeFile(backupPath, content);
        backupFiles.push({ path: filePath, content });
      } catch (error) {
        logger.error(`Erro ao fazer backup do arquivo ${filePath}:`, error);
      }
    }

    const rollbackPoint: RollbackPoint = {
      id,
      timestamp,
      description: `Backup criado em ${timestamp}`,
      files: backupFiles
    };

    this.rollbackPoints.set(id, rollbackPoint);
    return rollbackPoint;
  }

  private async applyRollback(rollbackPoint: RollbackPoint): Promise<void> {
    for (const file of rollbackPoint.files) {
      try {
        await fs.writeFile(file.path, file.content);
        logger.info(`Arquivo restaurado: ${file.path}`);
      } catch (error) {
        logger.error(`Erro ao restaurar arquivo ${file.path}:`, error);
        throw error;
      }
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_rollback_point',
          description: 'Cria um ponto de rollback para um conjunto de arquivos',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Lista de caminhos dos arquivos'
              },
              description: {
                type: 'string',
                description: 'Descrição do ponto de rollback'
              }
            },
            required: ['files']
          }
        },
        {
          name: 'rollback_to_point',
          description: 'Reverte arquivos para um ponto de rollback específico',
          inputSchema: {
            type: 'object',
            properties: {
              rollbackId: {
                type: 'string',
                description: 'ID do ponto de rollback'
              }
            },
            required: ['rollbackId']
          }
        },
        {
          name: 'list_rollback_points',
          description: 'Lista todos os pontos de rollback disponíveis',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Número máximo de pontos para retornar'
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_rollback_point': {
          const { files, description } = request.params.arguments as {
            files: string[];
            description?: string;
          };

          try {
            const rollbackPoint = await this.createBackup(files);
            if (description) {
              rollbackPoint.description = description;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(rollbackPoint, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao criar ponto de rollback: ${error}`
            );
          }
        }

        case 'rollback_to_point': {
          const { rollbackId } = request.params.arguments as {
            rollbackId: string;
          };

          const rollbackPoint = this.rollbackPoints.get(rollbackId);
          if (!rollbackPoint) {
            throw new McpError(
              ErrorCode.InternalError,
              `Ponto de rollback não encontrado: ${rollbackId}`
            );
          }

          try {
            await this.applyRollback(rollbackPoint);
            return {
              content: [
                {
                  type: 'text',
                  text: `Rollback aplicado com sucesso para o ponto ${rollbackId}`
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao aplicar rollback: ${error}`
            );
          }
        }

        case 'list_rollback_points': {
          const { limit } = request.params.arguments as {
            limit?: number;
          };

          const points = Array.from(this.rollbackPoints.values())
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, limit);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(points, null, 2)
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
    logger.info('Rollback System MCP server running on stdio');
  }
}

const server = new RollbackSystemServer();
server.run().catch(logger.error);