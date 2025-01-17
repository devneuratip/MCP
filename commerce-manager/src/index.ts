#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

class CommerceManager {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'commerce-manager',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'process_payment',
          description: 'Processa um pagamento',
          inputSchema: {
            type: 'object',
            properties: {
              amount: {
                type: 'number',
                description: 'Valor do pagamento'
              },
              currency: {
                type: 'string',
                description: 'Moeda do pagamento'
              },
              method: {
                type: 'string',
                enum: ['credit_card', 'pix', 'boleto'],
                description: 'Método de pagamento'
              }
            },
            required: ['amount', 'currency', 'method']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'process_payment': {
            // Implementação básica inicial
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: 'Pagamento processado com sucesso',
                    ...request.params.arguments
                  })
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
      } catch (error: any) {
        console.error('Erro ao executar ferramenta:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Erro ao executar ferramenta: ${error.message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Commerce Manager MCP server running on stdio');
  }
}

const manager = new CommerceManager();
manager.run().catch((error) => {
  console.error('Erro fatal no servidor:', error);
  process.exit(1);
});