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
import chalk from 'chalk';

// Interfaces
interface TaskConfig {
  maxApiCost: number;
  autonomyLevel: 'full' | 'semi' | 'minimal';
  fallbackEnabled: boolean;
  retryAttempts: number;
}

interface Task {
  id: string;
  description: string;
  completed: boolean;
  createdAt: string;
  apiCost: number;
  fallbackStrategies: string[];
  decisions: Array<{ decision: string; reason: string }>;
  index: number;
  totalTasks: number;
  remainingApiCost: number;
  thoughts?: ThoughtData[];
}

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

interface TaskSequence {
  id: string;
  name: string;
  tasks: Task[];
  config: TaskConfig;
  currentTaskIndex: number;
  branches: Record<string, ThoughtData[]>;
}

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

class EnhancedTaskSequenceServer {
  private server: Server;
  private sequences: Map<string, TaskSequence> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'enhanced-task-sequence',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error: Error) => logger.error('MCP Error:', error);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'add_task_sequence',
          description: 'Adiciona uma nova sequência de tarefas com pensamento sequencial',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome da sequência de tarefas'
              },
              tasks: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Lista de descrições das tarefas'
              },
              config: {
                type: 'object',
                properties: {
                  maxApiCost: {
                    type: 'number',
                    description: 'Custo máximo de API permitido'
                  },
                  autonomyLevel: {
                    type: 'string',
                    enum: ['full', 'semi', 'minimal'],
                    description: 'Nível de autonomia'
                  },
                  fallbackEnabled: {
                    type: 'boolean',
                    description: 'Habilita estratégias de fallback'
                  },
                  retryAttempts: {
                    type: 'number',
                    description: 'Número de tentativas de retry'
                  }
                }
              }
            },
            required: ['name', 'tasks']
          }
        },
        {
          name: 'add_thought',
          description: 'Adiciona um pensamento à tarefa atual',
          inputSchema: {
            type: 'object',
            properties: {
              thought: {
                type: 'string',
                description: 'Conteúdo do pensamento'
              },
              thoughtNumber: {
                type: 'number',
                description: 'Número do pensamento na sequência'
              },
              totalThoughts: {
                type: 'number',
                description: 'Total estimado de pensamentos'
              },
              nextThoughtNeeded: {
                type: 'boolean',
                description: 'Se mais pensamentos são necessários'
              },
              isRevision: {
                type: 'boolean',
                description: 'Se é uma revisão de pensamento anterior'
              },
              revisesThought: {
                type: 'number',
                description: 'Número do pensamento sendo revisado'
              },
              branchFromThought: {
                type: 'number',
                description: 'Pensamento de origem do branch'
              },
              branchId: {
                type: 'string',
                description: 'Identificador do branch'
              }
            },
            required: ['thought', 'thoughtNumber', 'totalThoughts', 'nextThoughtNeeded']
          }
        },
        {
          name: 'complete_current_task',
          description: 'Marca a tarefa atual como concluída',
          inputSchema: {
            type: 'object',
            properties: {
              apiCost: {
                type: 'number',
                description: 'Custo de API usado'
              },
              decisions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    decision: {
                      type: 'string',
                      description: 'Decisão tomada'
                    },
                    reason: {
                      type: 'string',
                      description: 'Razão da decisão'
                    }
                  }
                }
              }
            }
          }
        },
        {
          name: 'get_sequence_status',
          description: 'Obtém o status da sequência atual',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'add_task_sequence':
          return await this.handleAddTaskSequence(request.params.arguments);
        case 'add_thought':
          return await this.handleAddThought(request.params.arguments);
        case 'complete_current_task':
          return await this.handleCompleteCurrentTask(request.params.arguments);
        case 'get_sequence_status':
          return await this.handleGetSequenceStatus();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Ferramenta desconhecida: ${request.params.name}`
          );
      }
    });
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  private async handleAddTaskSequence(args: any) {
    try {
      const sequenceId = Math.random().toString(36).substring(2, 12);
      const tasks: Task[] = args.tasks.map((description: string, index: number) => ({
        id: `${sequenceId}-${index}`,
        description,
        completed: false,
        createdAt: new Date().toISOString(),
        apiCost: 0,
        fallbackStrategies: [],
        decisions: [],
        index,
        totalTasks: args.tasks.length,
        remainingApiCost: args.config?.maxApiCost || 100,
        thoughts: []
      }));

      const sequence: TaskSequence = {
        id: sequenceId,
        name: args.name,
        tasks,
        config: {
          maxApiCost: args.config?.maxApiCost || 100,
          autonomyLevel: args.config?.autonomyLevel || 'full',
          fallbackEnabled: args.config?.fallbackEnabled || true,
          retryAttempts: args.config?.retryAttempts || 3
        },
        currentTaskIndex: 0,
        branches: {}
      };

      this.sequences.set(sequenceId, sequence);

      logger.info('Nova sequência de tarefas criada', { sequenceId, totalTasks: tasks.length });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'Sequência de tarefas criada com sucesso',
              sequenceId,
              totalTasks: tasks.length,
              config: sequence.config
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      logger.error('Erro ao criar sequência:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Erro ao criar sequência: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleAddThought(args: any) {
    try {
      const currentSequence = Array.from(this.sequences.values()).find(s => !s.tasks[s.currentTaskIndex].completed);
      if (!currentSequence) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Nenhuma sequência ativa encontrada'
        );
      }

      const currentTask = currentSequence.tasks[currentSequence.currentTaskIndex];
      const thought: ThoughtData = {
        thought: args.thought,
        thoughtNumber: args.thoughtNumber,
        totalThoughts: args.totalThoughts,
        nextThoughtNeeded: args.nextThoughtNeeded,
        isRevision: args.isRevision,
        revisesThought: args.revisesThought,
        branchFromThought: args.branchFromThought,
        branchId: args.branchId
      };

      if (!currentTask.thoughts) {
        currentTask.thoughts = [];
      }
      currentTask.thoughts.push(thought);

      if (thought.branchFromThought && thought.branchId) {
        if (!currentSequence.branches[thought.branchId]) {
          currentSequence.branches[thought.branchId] = [];
        }
        currentSequence.branches[thought.branchId].push(thought);
      }

      const formattedThought = this.formatThought(thought);
      console.error(formattedThought);

      logger.info('Pensamento adicionado à tarefa', {
        taskId: currentTask.id,
        thoughtNumber: thought.thoughtNumber,
        isRevision: thought.isRevision,
        branchId: thought.branchId
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              thoughtNumber: thought.thoughtNumber,
              totalThoughts: thought.totalThoughts,
              nextThoughtNeeded: thought.nextThoughtNeeded,
              branches: Object.keys(currentSequence.branches),
              thoughtCount: currentTask.thoughts.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      logger.error('Erro ao adicionar pensamento:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Erro ao adicionar pensamento: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleCompleteCurrentTask(args: any) {
    try {
      const currentSequence = Array.from(this.sequences.values()).find(s => !s.tasks[s.currentTaskIndex].completed);
      if (!currentSequence) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Nenhuma sequência ativa encontrada'
        );
      }

      const currentTask = currentSequence.tasks[currentSequence.currentTaskIndex];
      currentTask.completed = true;
      currentTask.apiCost = args.apiCost || 0;
      if (args.decisions) {
        currentTask.decisions = args.decisions;
      }

      currentSequence.currentTaskIndex++;
      const isSequenceComplete = currentSequence.currentTaskIndex >= currentSequence.tasks.length;

      logger.info('Tarefa concluída', {
        taskId: currentTask.id,
        sequenceId: currentSequence.id,
        isSequenceComplete,
        thoughtCount: currentTask.thoughts?.length || 0
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'Tarefa concluída com sucesso',
              isSequenceComplete,
              nextTaskIndex: currentSequence.currentTaskIndex,
              currentApiCost: currentTask.apiCost,
              remainingApiCost: currentTask.remainingApiCost - currentTask.apiCost
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      logger.error('Erro ao concluir tarefa:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Erro ao concluir tarefa: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleGetSequenceStatus() {
    try {
      const currentSequence = Array.from(this.sequences.values()).find(s => !s.tasks[s.currentTaskIndex].completed);
      if (!currentSequence) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Nenhuma sequência ativa encontrada'
        );
      }

      const currentTask = currentSequence.tasks[currentSequence.currentTaskIndex];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sequenceId: currentSequence.id,
              name: currentSequence.name,
              currentTask: {
                id: currentTask.id,
                description: currentTask.description,
                index: currentTask.index,
                totalTasks: currentTask.totalTasks,
                thoughtCount: currentTask.thoughts?.length || 0,
                decisions: currentTask.decisions
              },
              config: currentSequence.config,
              branches: Object.keys(currentSequence.branches)
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      logger.error('Erro ao obter status:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Erro ao obter status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Enhanced Task Sequence MCP server iniciado');
  }
}

const server = new EnhancedTaskSequenceServer();
server.run().catch((error: Error) => {
  logger.error('Erro fatal:', error);
  process.exit(1);
});