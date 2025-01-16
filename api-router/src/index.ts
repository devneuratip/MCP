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
import { ApiRouter } from './api-router.js';
import { RouterConfig } from './types.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const tools = {
  add_api_key: {
    name: 'add_api_key',
    description: 'Adiciona uma nova chave de API ao pool',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        key: { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' }
      },
      required: ['id', 'key', 'provider', 'model']
    }
  },
  process_request: {
    name: 'process_request',
    description: 'Processa uma requisição usando o pool de APIs',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              content: { type: 'string' },
              role: { type: 'string' }
            }
          }
        },
        model: { type: 'string' },
        provider: { type: 'string' }
      },
      required: ['messages', 'model', 'provider']
    }
  },
  get_metrics: {
    name: 'get_metrics',
    description: 'Obtém métricas de uso das APIs',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  update_config: {
    name: 'update_config',
    description: 'Atualiza a configuração do roteador',
    inputSchema: {
      type: 'object',
      properties: {
        rotationStrategy: { type: 'string' },
        messageCompression: {
          type: 'object',
          properties: {
            maxTokens: { type: 'number' },
            summaryThreshold: { type: 'number' },
            compressionStrategy: { type: 'string' }
          }
        }
      }
    }
  }
};

async function main() {
  try {
    const defaultConfig: RouterConfig = {
      rotationStrategy: 'round-robin',
      messageCompression: {
        maxTokens: 8000,
        summaryThreshold: 6000,
        compressionStrategy: 'hybrid'
      },
      fallbackEnabled: true,
      retryAttempts: 2,
      improvePromptEnabled: true
    };

    const apiRouter = new ApiRouter(defaultConfig);

    // Inicializa as chaves do ambiente
    const keys = [
      process.env.ANTHROPIC_API_KEY_1,
      process.env.ANTHROPIC_API_KEY_2,
      process.env.ANTHROPIC_API_KEY_3
    ].filter(Boolean);

    keys.forEach((key, index) => {
      if (key) {
        apiRouter.addApiKey({
          id: `anthropic-${index + 1}`,
          key,
          provider: 'anthropic',
          model: 'claude-2',
          usageCount: 0,
          lastUsed: new Date()
        });
        logger.info(`API key anthropic-${index + 1} initialized`);
      }
    });

    const server = new Server(
      {
        name: 'api-router',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Object.values(tools)
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        const { name, arguments: args } = request.params;

        // Intercepta requisições do Anthropic e aplica o roteamento
        if (args.provider === 'anthropic') {
          const response = await apiRouter.processRequest({
            messages: args.messages,
            model: args.model || 'claude-2',
            provider: 'anthropic'
          });
          return {
            content: [{ type: 'text', text: response.content }]
          };
        }

        switch (name) {
          case 'add_api_key': {
            apiRouter.addApiKey(args);
            return {
              content: [{ type: 'text', text: `API key ${args.id} added successfully` }]
            };
          }

          case 'process_request': {
            const response = await apiRouter.processRequest(args);
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
            };
          }

          case 'get_metrics': {
            return {
              content: [{ type: 'text', text: JSON.stringify(apiRouter.getMetrics(), null, 2) }]
            };
          }

          case 'update_config': {
            const newConfig = request.params.arguments;
            Object.assign(defaultConfig, newConfig);
            return {
              content: [{ type: 'text', text: 'Configuration updated successfully' }]
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error: any) {
        logger.error('Error executing tool:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool: ${error.message}`
        );
      }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('API Router MCP server running on stdio');

  } catch (error: any) {
    logger.error('Fatal server error:', error);
    process.exit(1);
  }
}

main().catch((error: Error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});