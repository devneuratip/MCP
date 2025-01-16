#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAI } from 'openai';
import { CohereClient } from 'cohere-ai';
import axios from 'axios';
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
type ProviderType = 'openai' | 'anthropic' | 'cohere' | 'deepseek' | 'cascade';

interface ChatbotConfig {
  id: string;
  name: string;
  provider: ProviderType;
  model: string;
  apiKey?: string; // Opcional para Cascade
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  cascadeChatId?: string; // ID do chat no Cascade
}

interface ProviderInfo {
  name: string;
  models: string[];
  requiresApiKey: boolean;
  description: string;
}

const PROVIDERS: Record<ProviderType, ProviderInfo> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    description: 'Modelos GPT da OpenAI'
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-2.1'],
    requiresApiKey: true,
    description: 'Modelos Claude da Anthropic'
  },
  cohere: {
    name: 'Cohere',
    models: ['command', 'command-light', 'command-nightly'],
    requiresApiKey: true,
    description: 'Modelos da Cohere'
  },
  deepseek: {
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-coder'],
    requiresApiKey: true,
    description: 'Modelos da DeepSeek'
  },
  cascade: {
    name: 'Cascade (Windsurf)',
    models: ['claude-3-sonnet'],
    requiresApiKey: false,
    description: 'Claude 3.5 Sonnet via Windsurf Editor (ilimitado)'
  }
};

class ChatbotManager {
  private server: Server;
  private cache: NodeCache;
  private openaiClients: Map<string, OpenAI>;
  private cohereClients: Map<string, CohereClient>;
  private apiKeys: Map<string, string>;

  constructor() {
    this.server = new Server(
      {
        name: 'chatbot-manager',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.openaiClients = new Map();
    this.cohereClients = new Map();
    this.apiKeys = new Map();

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
          name: 'get_providers',
          description: 'Lista todos os providers disponíveis e seus modelos',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'create_chatbot',
          description: 'Cria um novo chatbot com o provider especificado',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do chatbot'
              },
              provider: {
                type: 'string',
                enum: ['openai', 'anthropic', 'cohere', 'deepseek', 'cascade'],
                description: 'Provider do chatbot'
              },
              model: {
                type: 'string',
                description: 'Modelo a ser usado'
              },
              apiKey: {
                type: 'string',
                description: 'Chave API do provider (não necessário para Cascade)'
              },
              systemPrompt: {
                type: 'string',
                description: 'Prompt do sistema (opcional)'
              },
              temperature: {
                type: 'number',
                description: 'Temperatura para geração (opcional)',
                minimum: 0,
                maximum: 1
              },
              maxTokens: {
                type: 'number',
                description: 'Número máximo de tokens (opcional)',
                minimum: 1
              }
            },
            required: ['name', 'provider', 'model']
          }
        },
        {
          name: 'send_message',
          description: 'Envia uma mensagem para um chatbot específico',
          inputSchema: {
            type: 'object',
            properties: {
              chatbotId: {
                type: 'string',
                description: 'ID do chatbot'
              },
              message: {
                type: 'string',
                description: 'Mensagem a ser enviada'
              }
            },
            required: ['chatbotId', 'message']
          }
        },
        {
          name: 'list_chatbots',
          description: 'Lista todos os chatbots criados',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'update_chatbot',
          description: 'Atualiza as configurações de um chatbot',
          inputSchema: {
            type: 'object',
            properties: {
              chatbotId: {
                type: 'string',
                description: 'ID do chatbot'
              },
              systemPrompt: {
                type: 'string',
                description: 'Novo prompt do sistema'
              },
              temperature: {
                type: 'number',
                description: 'Nova temperatura',
                minimum: 0,
                maximum: 1
              },
              maxTokens: {
                type: 'number',
                description: 'Novo número máximo de tokens',
                minimum: 1
              }
            },
            required: ['chatbotId']
          }
        },
        {
          name: 'delete_chatbot',
          description: 'Remove um chatbot',
          inputSchema: {
            type: 'object',
            properties: {
              chatbotId: {
                type: 'string',
                description: 'ID do chatbot'
              }
            },
            required: ['chatbotId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        switch (request.params.name) {
          case 'get_providers': {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(PROVIDERS, null, 2)
                }
              ]
            };
          }

          case 'create_chatbot': {
            const { name, provider, model, apiKey, systemPrompt, temperature, maxTokens } = 
              request.params.arguments as {
                name: string;
                provider: ProviderType;
                model: string;
                apiKey?: string;
                systemPrompt?: string;
                temperature?: number;
                maxTokens?: number;
              };

            // Valida o provider e modelo
            const providerInfo = PROVIDERS[provider];
            if (!providerInfo) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Provider não suportado: ${provider}`
              );
            }

            if (!providerInfo.models.includes(model)) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Modelo não suportado para ${provider}: ${model}`
              );
            }

            // Verifica se precisa de API key
            if (providerInfo.requiresApiKey && !apiKey) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `API key é obrigatória para ${provider}`
              );
            }

            const id = nanoid();
            const config: ChatbotConfig = {
              id,
              name,
              provider,
              model,
              apiKey,
              systemPrompt,
              temperature,
              maxTokens
            };

            // Inicializa o cliente apropriado
            switch (provider) {
              case 'openai':
                this.openaiClients.set(id, new OpenAI({ apiKey }));
                break;
              case 'cohere':
                this.cohereClients.set(id, new CohereClient({ token: apiKey }));
                break;
              case 'cascade': {
                // Cria um novo chat no Cascade
                const response = await axios.post('http://localhost:3000/cascade/chat', {
                  model,
                  systemPrompt
                });
                config.cascadeChatId = response.data.chatId;
                break;
              }
              default:
                if (apiKey) this.apiKeys.set(id, apiKey);
                break;
            }

            this.cache.set(id, config);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ id, message: 'Chatbot criado com sucesso' })
                }
              ]
            };
          }

          case 'send_message': {
            const { chatbotId, message } = request.params.arguments as {
              chatbotId: string;
              message: string;
            };

            const config = this.cache.get<ChatbotConfig>(chatbotId);
            if (!config) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Chatbot não encontrado: ${chatbotId}`
              );
            }

            let response: string;

            switch (config.provider) {
              case 'openai': {
                const client = this.openaiClients.get(chatbotId);
                if (!client) throw new Error('Cliente OpenAI não inicializado');
                
                const completion = await client.chat.completions.create({
                  model: config.model,
                  messages: [
                    ...(config.systemPrompt ? [{ role: 'system' as const, content: config.systemPrompt }] : []),
                    { role: 'user' as const, content: message }
                  ],
                  temperature: config.temperature,
                  max_tokens: config.maxTokens
                });
                response = completion.choices[0]?.message?.content || '';
                break;
              }

              case 'anthropic': {
                const apiKey = this.apiKeys.get(chatbotId);
                if (!apiKey) throw new Error('Cliente Anthropic não inicializado');

                const result = await axios.post(
                  'https://api.anthropic.com/v1/messages',
                  {
                    model: config.model,
                    messages: [
                      ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
                      { role: 'user', content: message }
                    ],
                    temperature: config.temperature,
                    max_tokens: config.maxTokens
                  },
                  {
                    headers: {
                      'x-api-key': apiKey,
                      'anthropic-version': '2023-06-01',
                      'Content-Type': 'application/json'
                    }
                  }
                );
                response = result.data.content[0]?.text || '';
                break;
              }

              case 'cohere': {
                const client = this.cohereClients.get(chatbotId);
                if (!client) throw new Error('Cliente Cohere não inicializado');
                
                const generation = await client.generate({
                  prompt: message,
                  model: config.model,
                  temperature: config.temperature,
                  maxTokens: config.maxTokens
                });
                response = generation.generations[0]?.text || '';
                break;
              }

              case 'deepseek': {
                const apiKey = this.apiKeys.get(chatbotId);
                if (!apiKey) throw new Error('Cliente DeepSeek não inicializado');

                const result = await axios.post(
                  'https://api.deepseek.com/v1/chat/completions',
                  {
                    model: config.model,
                    messages: [
                      ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
                      { role: 'user', content: message }
                    ],
                    temperature: config.temperature,
                    maxTokens: config.maxTokens
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                response = result.data.choices[0]?.message?.content || '';
                break;
              }

              case 'cascade': {
                if (!config.cascadeChatId) throw new Error('Chat ID do Cascade não encontrado');
                
                // Envia mensagem para o Cascade
                const result = await axios.post(`http://localhost:3000/cascade/chat/${config.cascadeChatId}/message`, {
                  content: message
                });
                response = result.data.response;
                break;
              }

              default:
                throw new Error(`Provider não suportado: ${config.provider}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: response
                }
              ]
            };
          }

          case 'list_chatbots': {
            const chatbots = this.cache.mget<ChatbotConfig>(this.cache.keys());
            const sanitizedChatbots = Object.values(chatbots).map(({ apiKey, ...rest }) => rest);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(sanitizedChatbots, null, 2)
                }
              ]
            };
          }

          case 'update_chatbot': {
            const { chatbotId, systemPrompt, temperature, maxTokens } = 
              request.params.arguments as {
                chatbotId: string;
                systemPrompt?: string;
                temperature?: number;
                maxTokens?: number;
              };

            const config = this.cache.get<ChatbotConfig>(chatbotId);
            if (!config) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Chatbot não encontrado: ${chatbotId}`
              );
            }

            const updatedConfig = {
              ...config,
              ...(systemPrompt !== undefined && { systemPrompt }),
              ...(temperature !== undefined && { temperature }),
              ...(maxTokens !== undefined && { maxTokens })
            };

            // Se for Cascade, atualiza também no servidor
            if (config.provider === 'cascade' && config.cascadeChatId) {
              await axios.patch(`http://localhost:3000/cascade/chat/${config.cascadeChatId}`, {
                systemPrompt,
                temperature,
                maxTokens
              });
            }

            this.cache.set(chatbotId, updatedConfig);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ message: 'Chatbot atualizado com sucesso' })
                }
              ]
            };
          }

          case 'delete_chatbot': {
            const { chatbotId } = request.params.arguments as { chatbotId: string };

            const config = this.cache.get<ChatbotConfig>(chatbotId);
            if (!config) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Chatbot não encontrado: ${chatbotId}`
              );
            }

            // Se for Cascade, remove também no servidor
            if (config.provider === 'cascade' && config.cascadeChatId) {
              await axios.delete(`http://localhost:3000/cascade/chat/${config.cascadeChatId}`);
            }

            // Remove o cliente e a configuração
            this.openaiClients.delete(chatbotId);
            this.cohereClients.delete(chatbotId);
            this.apiKeys.delete(chatbotId);
            this.cache.del(chatbotId);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ message: 'Chatbot removido com sucesso' })
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
    logger.info('Chatbot Manager MCP server running on stdio');
  }
}

const manager = new ChatbotManager();
manager.run().catch((error: Error) => {
  logger.error('Erro fatal no servidor:', error);
  process.exit(1);
});