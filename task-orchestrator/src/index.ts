#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ServerRegistry } from './server-registry.js';
import { IntegrationManager } from './integrations/integration-manager.js';
import winston from 'winston';

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class TaskOrchestratorServer {
  private server: Server;
  private registry: ServerRegistry;
  private integrationManager: IntegrationManager;

  constructor() {
    this.server = new Server(
      {
        name: 'task-orchestrator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registry = new ServerRegistry();
    this.integrationManager = new IntegrationManager(this.registry);
    
    this.setupToolHandlers();
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'register_server',
          description: 'Registra um novo servidor MCP',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do servidor'
              },
              server: {
                type: 'object',
                description: 'Instância do servidor MCP'
              }
            },
            required: ['name', 'server']
          }
        },
        {
          name: 'get_server_status',
          description: 'Obtém o status de um servidor registrado',
          inputSchema: {
            type: 'object',
            properties: {
              serverId: {
                type: 'string',
                description: 'ID do servidor'
              }
            },
            required: ['serverId']
          }
        },
        {
          name: 'list_servers',
          description: 'Lista todos os servidores registrados',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'find_servers_by_capability',
          description: 'Encontra servidores com uma capacidade específica',
          inputSchema: {
            type: 'object',
            properties: {
              capability: {
                type: 'string',
                description: 'Capacidade a ser procurada'
              }
            },
            required: ['capability']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'register_server':
            return await this.handleRegisterServer(request.params.arguments);
          case 'get_server_status':
            return await this.handleGetServerStatus(request.params.arguments);
          case 'list_servers':
            return await this.handleListServers();
          case 'find_servers_by_capability':
            return await this.handleFindServersByCapability(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Ferramenta desconhecida: ${request.params.name}`
            );
        }
      } catch (error) {
        logger.error('Erro ao executar ferramenta:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Erro ao executar ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async handleRegisterServer(args: any) {
    try {
      const connection = await this.registry.registerServer(args.name, args.server);
      await this.integrationManager.initializeIntegrations();
      await this.integrationManager.monitorServer(connection.id);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'Servidor registrado com sucesso',
              serverId: connection.id,
              capabilities: connection.capabilities
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      await this.integrationManager.handleError(error as Error, {
        serverId: 'system',
        operation: 'registerServer'
      });
      throw error;
    }
  }

  private async handleGetServerStatus(args: any) {
    const server = this.registry.getServer(args.serverId);
    if (!server) {
      throw new McpError(ErrorCode.InvalidRequest, `Servidor não encontrado: ${args.serverId}`);
    }

    try {
      const cachedStatus = await this.integrationManager.cacheServerData(args.serverId, {
        id: server.id,
        name: server.name,
        status: server.status,
        capabilities: server.capabilities,
        lastHealthCheck: server.lastHealthCheck
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cachedStatus, null, 2)
          }
        ]
      };
    } catch (error) {
      await this.integrationManager.handleError(error as Error, {
        serverId: args.serverId,
        operation: 'getServerStatus'
      });
      throw error;
    }
  }

  private async handleListServers() {
    const servers = this.registry.getAllServers();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            servers: servers.map(s => ({
              id: s.id,
              name: s.name,
              status: s.status,
              capabilities: s.capabilities
            }))
          }, null, 2)
        }
      ]
    };
  }

  private async handleFindServersByCapability(args: any) {
    const servers = this.registry.getServersByCapability(args.capability);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            capability: args.capability,
            servers: servers.map(s => ({
              id: s.id,
              name: s.name,
              status: s.status
            }))
          }, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Task Orchestrator MCP server iniciado');
  }
}

const server = new TaskOrchestratorServer();
server.run().catch((error: Error) => {
  logger.error('Erro fatal:', error);
  process.exit(1);
});
