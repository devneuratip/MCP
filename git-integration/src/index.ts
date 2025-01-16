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
import { simpleGit, SimpleGit } from 'simple-git';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class GitIntegrationServer {
  private server: Server;
  private git: SimpleGit;

  constructor() {
    this.server = new Server(
      {
        name: 'git-integration',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.git = simpleGit();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async validateGitRepo(path: string): Promise<void> {
    try {
      const git = simpleGit({ baseDir: path });
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `O diretório ${path} não é um repositório Git válido`
        );
      }
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Erro ao validar repositório Git: ${error}`
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'git_status',
          description: 'Obtém o status do repositório Git',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Caminho do repositório'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'git_commit',
          description: 'Realiza um commit no repositório',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Caminho do repositório'
              },
              message: {
                type: 'string',
                description: 'Mensagem do commit'
              }
            },
            required: ['path', 'message']
          }
        },
        {
          name: 'git_push',
          description: 'Envia alterações para o repositório remoto',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Caminho do repositório'
              }
            },
            required: ['path']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'git_status': {
          const { path } = request.params.arguments as { path: string };
          
          try {
            await this.validateGitRepo(path);
            const git = simpleGit({ baseDir: path });
            const status = await git.status();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(status, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao obter status do Git: ${error}`
            );
          }
        }

        case 'git_commit': {
          const { path, message } = request.params.arguments as {
            path: string;
            message: string;
          };

          try {
            await this.validateGitRepo(path);
            const git = simpleGit({ baseDir: path });
            
            // Verifica se há alterações para commit
            const status = await git.status();
            if (!status.modified.length && !status.not_added.length && !status.deleted.length) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                'Não há alterações para fazer commit'
              );
            }

            await git.add('./*');
            const result = await git.commit(message);
            return {
              content: [
                {
                  type: 'text',
                  text: `Commit realizado: ${result.commit}`
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao realizar commit: ${error}`
            );
          }
        }

        case 'git_push': {
          const { path } = request.params.arguments as { path: string };

          try {
            await this.validateGitRepo(path);
            const git = simpleGit({ baseDir: path });
            
            // Verifica a branch atual
            const branch = await git.branch();
            if (!branch.current) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                'Não foi possível determinar a branch atual'
              );
            }

            // Verifica se há commits para enviar
            const status = await git.status();
            if (!status.ahead) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                'Não há commits para enviar'
              );
            }

            const result = await git.push('origin', branch.current);
            return {
              content: [
                {
                  type: 'text',
                  text: `Push realizado com sucesso na branch ${branch.current}`
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao realizar push: ${error}`
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
    logger.info('Git Integration MCP server running on stdio');
  }
}

const server = new GitIntegrationServer();
server.run().catch(logger.error);