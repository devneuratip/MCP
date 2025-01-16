#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import Stripe from 'stripe';
import MercadoPago from 'mercadopago';
import { Client as WhatsAppClient } from 'whatsapp-web.js';
import nodemailer from 'nodemailer';
import Bull from 'bull';
import Redis from 'redis';
import NodeCache from 'node-cache';
import { nanoid } from 'nanoid';
import winston from 'winston';

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Tipos
interface PaymentConfig {
  provider: 'stripe' | 'mercadopago';
  apiKey: string;
}

interface MessageConfig {
  provider: 'whatsapp' | 'email';
  config: any;
}

interface WorkflowStep {
  type: 'payment' | 'message' | 'queue';
  action: string;
  params: any;
}

interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

class IntegrationHub {
  private server: Server;
  private cache: NodeCache;
  private stripeClients: Map<string, Stripe>;
  private mpClients: Map<string, typeof MercadoPago>;
  private whatsappClient: WhatsAppClient | null;
  private emailTransporter: nodemailer.Transporter | null;
  private queues: Map<string, Bull.Queue>;
  private workflows: Map<string, Workflow>;

  constructor() {
    this.server = new Server(
      {
        name: 'integration-hub',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.stripeClients = new Map();
    this.mpClients = new Map();
    this.whatsappClient = null;
    this.emailTransporter = null;
    this.queues = new Map();
    this.workflows = new Map();

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_payment',
          description: 'Cria um novo pagamento',
          inputSchema: {
            type: 'object',
            properties: {
              provider: {
                type: 'string',
                enum: ['stripe', 'mercadopago'],
                description: 'Provedor de pagamento'
              },
              apiKey: {
                type: 'string',
                description: 'Chave API do provedor'
              },
              amount: {
                type: 'number',
                description: 'Valor do pagamento'
              },
              currency: {
                type: 'string',
                description: 'Moeda do pagamento'
              },
              description: {
                type: 'string',
                description: 'Descrição do pagamento'
              }
            },
            required: ['provider', 'apiKey', 'amount', 'currency']
          }
        },
        {
          name: 'get_payment_status',
          description: 'Verifica o status de um pagamento',
          inputSchema: {
            type: 'object',
            properties: {
              provider: {
                type: 'string',
                enum: ['stripe', 'mercadopago'],
                description: 'Provedor de pagamento'
              },
              paymentId: {
                type: 'string',
                description: 'ID do pagamento'
              }
            },
            required: ['provider', 'paymentId']
          }
        },
        {
          name: 'send_message',
          description: 'Envia uma mensagem',
          inputSchema: {
            type: 'object',
            properties: {
              provider: {
                type: 'string',
                enum: ['whatsapp', 'email'],
                description: 'Provedor de mensagem'
              },
              to: {
                type: 'string',
                description: 'Destinatário'
              },
              message: {
                type: 'string',
                description: 'Conteúdo da mensagem'
              },
              template: {
                type: 'string',
                description: 'ID do template (opcional)'
              }
            },
            required: ['provider', 'to', 'message']
          }
        },
        {
          name: 'create_message_template',
          description: 'Cria um template de mensagem',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do template'
              },
              content: {
                type: 'string',
                description: 'Conteúdo do template'
              },
              variables: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Variáveis do template'
              }
            },
            required: ['name', 'content']
          }
        },
        {
          name: 'create_workflow',
          description: 'Cria um workflow de integração',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do workflow'
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['payment', 'message', 'queue']
                    },
                    action: {
                      type: 'string'
                    },
                    params: {
                      type: 'object'
                    }
                  },
                  required: ['type', 'action', 'params']
                }
              }
            },
            required: ['name', 'steps']
          }
        },
        {
          name: 'execute_workflow',
          description: 'Executa um workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: {
                type: 'string',
                description: 'ID do workflow'
              },
              params: {
                type: 'object',
                description: 'Parâmetros para execução'
              }
            },
            required: ['workflowId']
          }
        },
        {
          name: 'add_to_queue',
          description: 'Adiciona uma tarefa à fila',
          inputSchema: {
            type: 'object',
            properties: {
              queueName: {
                type: 'string',
                description: 'Nome da fila'
              },
              data: {
                type: 'object',
                description: 'Dados da tarefa'
              },
              options: {
                type: 'object',
                description: 'Opções da tarefa'
              }
            },
            required: ['queueName', 'data']
          }
        },
        {
          name: 'get_queue_status',
          description: 'Verifica o status de uma fila',
          inputSchema: {
            type: 'object',
            properties: {
              queueName: {
                type: 'string',
                description: 'Nome da fila'
              }
            },
            required: ['queueName']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        switch (request.params.name) {
          case 'create_payment': {
            const { provider, apiKey, amount, currency, description } = request.params.arguments;
            let paymentId: string;

            switch (provider) {
              case 'stripe': {
                const stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' });
                const paymentIntent = await stripe.paymentIntents.create({
                  amount,
                  currency,
                  description
                });
                paymentId = paymentIntent.id;
                break;
              }
              case 'mercadopago': {
                const mp = new MercadoPago({ access_token: apiKey });
                const payment = await mp.payment.create({
                  transaction_amount: amount,
                  currency_id: currency,
                  description
                });
                paymentId = payment.id;
                break;
              }
              default:
                throw new Error(`Provider não suportado: ${provider}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ paymentId })
                }
              ]
            };
          }

          case 'send_message': {
            const { provider, to, message, template } = request.params.arguments;
            
            switch (provider) {
              case 'whatsapp': {
                if (!this.whatsappClient) {
                  this.whatsappClient = new WhatsAppClient({});
                  await this.whatsappClient.initialize();
                }
                await this.whatsappClient.sendMessage(to, message);
                break;
              }
              case 'email': {
                if (!this.emailTransporter) {
                  this.emailTransporter = nodemailer.createTransport({
                    // Configuração do email
                  });
                }
                await this.emailTransporter.sendMail({
                  to,
                  text: message
                });
                break;
              }
              default:
                throw new Error(`Provider não suportado: ${provider}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true })
                }
              ]
            };
          }

          case 'create_workflow': {
            const { name, steps } = request.params.arguments;
            const id = nanoid();
            
            const workflow: Workflow = {
              id,
              name,
              steps
            };

            this.workflows.set(id, workflow);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ id, message: 'Workflow criado com sucesso' })
                }
              ]
            };
          }

          case 'execute_workflow': {
            const { workflowId, params } = request.params.arguments;
            const workflow = this.workflows.get(workflowId);
            
            if (!workflow) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Workflow não encontrado: ${workflowId}`
              );
            }

            // Executa cada passo do workflow
            for (const step of workflow.steps) {
              switch (step.type) {
                case 'payment':
                  // Executa ação de pagamento
                  break;
                case 'message':
                  // Envia mensagem
                  break;
                case 'queue':
                  // Adiciona à fila
                  break;
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true })
                }
              ]
            };
          }

          case 'add_to_queue': {
            const { queueName, data, options } = request.params.arguments;
            
            if (!this.queues.has(queueName)) {
              this.queues.set(queueName, new Bull(queueName, {
                redis: { port: 6379, host: '127.0.0.1' }
              }));
            }

            const queue = this.queues.get(queueName)!;
            const job = await queue.add(data, options);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ jobId: job.id })
                }
              ]
            };
          }

          case 'get_queue_status': {
            const { queueName } = request.params.arguments;
            
            if (!this.queues.has(queueName)) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Fila não encontrada: ${queueName}`
              );
            }

            const queue = this.queues.get(queueName)!;
            const [waiting, active, completed, failed] = await Promise.all([
              queue.getWaitingCount(),
              queue.getActiveCount(),
              queue.getCompletedCount(),
              queue.getFailedCount()
            ]);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    waiting,
                    active,
                    completed,
                    failed
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
        logger.error('Erro ao executar ferramenta:', error);
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
    logger.info('Integration Hub MCP server running on stdio');
  }
}

const hub = new IntegrationHub();
hub.run().catch((error: Error) => {
  logger.error('Erro fatal no servidor:', error);
  process.exit(1);
});