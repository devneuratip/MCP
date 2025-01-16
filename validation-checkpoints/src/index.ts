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
import { z } from 'zod';
import Joi from 'joi';
import * as yup from 'yup';
import { validate } from 'class-validator';
import validator from 'validator';
import NodeCache from 'node-cache';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface ValidationRule {
  id: string;
  name: string;
  type: 'zod' | 'joi' | 'yup' | 'class-validator' | 'custom';
  schema: any;
  customValidator?: (data: any) => Promise<boolean>;
  errorMessage?: string;
  priority: number;
}

interface ValidationResult {
  passed: boolean;
  errors: {
    rule: string;
    message: string;
  }[];
}

interface ValidationCheckpoint {
  id: string;
  name: string;
  description: string;
  rules: ValidationRule[];
}

class ValidationCheckpointsServer {
  private server: Server;
  private cache: NodeCache;
  private checkpoints: Map<string, ValidationCheckpoint>;

  constructor() {
    this.server = new Server(
      {
        name: 'validation-checkpoints',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.checkpoints = new Map();

    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async validateWithZod(data: any, schema: z.ZodType<any>): Promise<boolean> {
    try {
      await schema.parseAsync(data);
      return true;
    } catch {
      return false;
    }
  }

  private async validateWithJoi(data: any, schema: Joi.Schema): Promise<boolean> {
    try {
      await schema.validateAsync(data);
      return true;
    } catch {
      return false;
    }
  }

  private async validateWithYup(data: any, schema: yup.Schema<any>): Promise<boolean> {
    try {
      await schema.validate(data);
      return true;
    } catch {
      return false;
    }
  }

  private async validateWithClassValidator(data: any, schema: any): Promise<boolean> {
    const errors = await validate(data, schema);
    return errors.length === 0;
  }

  private async validateRule(data: any, rule: ValidationRule): Promise<boolean> {
    try {
      switch (rule.type) {
        case 'zod':
          return await this.validateWithZod(data, rule.schema);
        case 'joi':
          return await this.validateWithJoi(data, rule.schema);
        case 'yup':
          return await this.validateWithYup(data, rule.schema);
        case 'class-validator':
          return await this.validateWithClassValidator(data, rule.schema);
        case 'custom':
          return rule.customValidator ? await rule.customValidator(data) : false;
        default:
          return false;
      }
    } catch (error) {
      logger.error(`Erro ao validar regra ${rule.id}:`, error);
      return false;
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_checkpoint',
          description: 'Cria um novo ponto de validação',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome do ponto de validação'
              },
              description: {
                type: 'string',
                description: 'Descrição do ponto de validação'
              },
              rules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Nome da regra'
                    },
                    type: {
                      type: 'string',
                      enum: ['zod', 'joi', 'yup', 'class-validator', 'custom'],
                      description: 'Tipo de validação'
                    },
                    schema: {
                      type: 'object',
                      description: 'Schema de validação'
                    },
                    errorMessage: {
                      type: 'string',
                      description: 'Mensagem de erro personalizada'
                    },
                    priority: {
                      type: 'number',
                      description: 'Prioridade da regra'
                    }
                  },
                  required: ['name', 'type', 'schema']
                }
              }
            },
            required: ['name', 'rules']
          }
        },
        {
          name: 'validate_checkpoint',
          description: 'Valida dados contra um ponto de validação',
          inputSchema: {
            type: 'object',
            properties: {
              checkpointId: {
                type: 'string',
                description: 'ID do ponto de validação'
              },
              data: {
                type: 'object',
                description: 'Dados para validar'
              }
            },
            required: ['checkpointId', 'data']
          }
        },
        {
          name: 'get_checkpoint',
          description: 'Obtém informações de um ponto de validação',
          inputSchema: {
            type: 'object',
            properties: {
              checkpointId: {
                type: 'string',
                description: 'ID do ponto de validação'
              }
            },
            required: ['checkpointId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_checkpoint': {
          const { name, description = '', rules } = request.params.arguments as {
            name: string;
            description?: string;
            rules: Omit<ValidationRule, 'id'>[];
          };

          try {
            const checkpointId = Buffer.from(Date.now().toString()).toString('hex');
            const checkpoint: ValidationCheckpoint = {
              id: checkpointId,
              name,
              description,
              rules: rules.map((rule, index) => ({
                ...rule,
                id: `${checkpointId}-rule-${index}`,
                priority: rule.priority || 0
              }))
            };

            this.checkpoints.set(checkpointId, checkpoint);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(checkpoint, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao criar ponto de validação: ${error}`
            );
          }
        }

        case 'validate_checkpoint': {
          const { checkpointId, data } = request.params.arguments as {
            checkpointId: string;
            data: any;
          };

          try {
            const checkpoint = this.checkpoints.get(checkpointId);
            if (!checkpoint) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Ponto de validação não encontrado: ${checkpointId}`
              );
            }

            const cacheKey = `validation:${checkpointId}:${JSON.stringify(data)}`;
            const cached = this.cache.get<ValidationResult>(cacheKey);
            if (cached) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(cached, null, 2)
                  }
                ]
              };
            }

            const errors: ValidationResult['errors'] = [];
            const sortedRules = [...checkpoint.rules].sort((a, b) => b.priority - a.priority);

            for (const rule of sortedRules) {
              const passed = await this.validateRule(data, rule);
              if (!passed) {
                errors.push({
                  rule: rule.name,
                  message: rule.errorMessage || `Falha na validação da regra: ${rule.name}`
                });
              }
            }

            const result: ValidationResult = {
              passed: errors.length === 0,
              errors
            };

            this.cache.set(cacheKey, result);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao validar dados: ${error}`
            );
          }
        }

        case 'get_checkpoint': {
          const { checkpointId } = request.params.arguments as {
            checkpointId: string;
          };

          const checkpoint = this.checkpoints.get(checkpointId);
          if (!checkpoint) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Ponto de validação não encontrado: ${checkpointId}`
            );
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(checkpoint, null, 2)
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
    logger.info('Validation Checkpoints MCP server running on stdio');
  }
}

const server = new ValidationCheckpointsServer();
server.run().catch(logger.error);