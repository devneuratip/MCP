#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

interface Task {
  id: string;
  description: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  apiCost?: number;
  fallbackStrategies?: string[];
  decisions?: Array<{
    timestamp: Date;
    decision: string;
    reason: string;
  }>;
}

interface TaskSequence {
  id: string;
  name: string;
  tasks: Task[];
  currentTaskIndex: number;
  createdAt: Date;
  completedAt?: Date;
  config: {
    maxApiCost: number;
    currentApiCost: number;
    autonomyLevel: 'full' | 'semi' | 'minimal';
    fallbackEnabled: boolean;
    retryAttempts: number;
  };
  executionLog: Array<{
    timestamp: Date;
    action: string;
    details: string;
  }>;
}

class TaskSequenceServer {
  private server: Server;
  private sequences: Map<string, TaskSequence>;
  private currentSequenceId: string | null;

  constructor() {
    this.server = new Server(
      {
        name: 'task-sequence-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sequences = new Map();
    this.currentSequenceId = null;

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
          name: 'add_task_sequence',
          description: 'Add a new task sequence with a list of tasks and configuration',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the task sequence',
              },
              tasks: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'List of task descriptions',
              },
              config: {
                type: 'object',
                properties: {
                  maxApiCost: {
                    type: 'number',
                    description: 'Maximum allowed API cost for the entire sequence',
                  },
                  autonomyLevel: {
                    type: 'string',
                    enum: ['full', 'semi', 'minimal'],
                    description: 'Level of autonomous decision making',
                  },
                  fallbackEnabled: {
                    type: 'boolean',
                    description: 'Enable fallback strategies for error handling',
                  },
                  retryAttempts: {
                    type: 'number',
                    description: 'Number of retry attempts for failed tasks',
                  }
                }
              }
            },
            required: ['name', 'tasks'],
          },
        },
        {
          name: 'get_current_task',
          description: 'Get the current task in the active sequence',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'complete_current_task',
          description: 'Mark the current task as complete and move to the next task',
          inputSchema: {
            type: 'object',
            properties: {
              apiCost: {
                type: 'number',
                description: 'API cost used for completing this task',
              },
              decisions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    decision: {
                      type: 'string',
                      description: 'Decision made during task execution',
                    },
                    reason: {
                      type: 'string',
                      description: 'Reasoning behind the decision',
                    }
                  }
                }
              }
            }
          },
        },
        {
          name: 'get_sequence_status',
          description: 'Get the status of the current task sequence',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'update_sequence_config',
          description: 'Update the configuration of the current sequence',
          inputSchema: {
            type: 'object',
            properties: {
              maxApiCost: {
                type: 'number',
                description: 'Maximum allowed API cost for the entire sequence',
              },
              autonomyLevel: {
                type: 'string',
                enum: ['full', 'semi', 'minimal'],
                description: 'Level of autonomous decision making',
              },
              fallbackEnabled: {
                type: 'boolean',
                description: 'Enable fallback strategies for error handling',
              },
              retryAttempts: {
                type: 'number',
                description: 'Number of retry attempts for failed tasks',
              }
            }
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'add_task_sequence':
          return this.handleAddTaskSequence(request.params.arguments);
        case 'get_current_task':
          return this.handleGetCurrentTask();
        case 'complete_current_task':
          return this.handleCompleteCurrentTask(request.params.arguments);
        case 'get_sequence_status':
          return this.handleGetSequenceStatus();
        case 'update_sequence_config':
          return this.handleUpdateSequenceConfig(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private handleAddTaskSequence(args: any) {
    if (!args.name || !Array.isArray(args.tasks) || args.tasks.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid task sequence arguments'
      );
    }

    const sequenceId = Math.random().toString(36).substring(2, 15);
    const sequence: TaskSequence = {
      id: sequenceId,
      name: args.name,
      tasks: args.tasks.map((description: string, index: number) => ({
        id: `${sequenceId}-${index}`,
        description,
        completed: false,
        createdAt: new Date(),
        apiCost: 0,
        fallbackStrategies: [],
        decisions: []
      })),
      currentTaskIndex: 0,
      createdAt: new Date(),
      config: {
        maxApiCost: args.config?.maxApiCost ?? Infinity,
        currentApiCost: 0,
        autonomyLevel: args.config?.autonomyLevel ?? 'full',
        fallbackEnabled: args.config?.fallbackEnabled ?? true,
        retryAttempts: args.config?.retryAttempts ?? 3
      },
      executionLog: [{
        timestamp: new Date(),
        action: 'sequence_created',
        details: `Created sequence "${args.name}" with ${args.tasks.length} tasks`
      }]
    };

    this.sequences.set(sequenceId, sequence);
    this.currentSequenceId = sequenceId;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Task sequence created successfully',
            sequenceId,
            totalTasks: sequence.tasks.length,
            config: sequence.config
          }, null, 2),
        },
      ],
    };
  }

  private handleGetCurrentTask() {
    const sequence = this.getCurrentSequence();
    const currentTask = sequence.tasks[sequence.currentTaskIndex];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            currentTask: {
              ...currentTask,
              index: sequence.currentTaskIndex,
              totalTasks: sequence.tasks.length,
              remainingApiCost: sequence.config.maxApiCost - sequence.config.currentApiCost
            },
          }, null, 2),
        },
      ],
    };
  }

  private handleCompleteCurrentTask(args: any) {
    const sequence = this.getCurrentSequence();
    const currentTask = sequence.tasks[sequence.currentTaskIndex];

    // Update task completion details
    currentTask.completed = true;
    currentTask.completedAt = new Date();
    
    // Update API cost if provided
    if (args?.apiCost) {
      currentTask.apiCost = args.apiCost;
      sequence.config.currentApiCost += args.apiCost;
      
      // Check if we've exceeded the API cost limit
      if (sequence.config.currentApiCost > sequence.config.maxApiCost) {
        sequence.executionLog.push({
          timestamp: new Date(),
          action: 'api_cost_exceeded',
          details: `API cost limit exceeded: ${sequence.config.currentApiCost}/${sequence.config.maxApiCost}`
        });
      }
    }

    // Record any decisions made during task execution
    if (args?.decisions) {
      currentTask.decisions = args.decisions.map((d: any) => ({
        timestamp: new Date(),
        decision: d.decision,
        reason: d.reason
      }));
    }

    // Log task completion
    sequence.executionLog.push({
      timestamp: new Date(),
      action: 'task_completed',
      details: `Completed task ${sequence.currentTaskIndex + 1}/${sequence.tasks.length}: ${currentTask.description}`
    });

    // Move to next task or complete sequence
    if (sequence.currentTaskIndex < sequence.tasks.length - 1) {
      sequence.currentTaskIndex++;
    } else {
      sequence.completedAt = new Date();
      sequence.executionLog.push({
        timestamp: new Date(),
        action: 'sequence_completed',
        details: `Completed all ${sequence.tasks.length} tasks`
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Task completed successfully',
            isSequenceComplete: sequence.completedAt !== undefined,
            nextTaskIndex: sequence.currentTaskIndex,
            currentApiCost: sequence.config.currentApiCost,
            remainingApiCost: sequence.config.maxApiCost - sequence.config.currentApiCost
          }, null, 2),
        },
      ],
    };
  }

  private handleGetSequenceStatus() {
    const sequence = this.getCurrentSequence();
    const completedTasks = sequence.tasks.filter(task => task.completed).length;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            name: sequence.name,
            totalTasks: sequence.tasks.length,
            completedTasks,
            currentTaskIndex: sequence.currentTaskIndex,
            isComplete: sequence.completedAt !== undefined,
            config: sequence.config,
            apiCostSummary: {
              current: sequence.config.currentApiCost,
              max: sequence.config.maxApiCost,
              remaining: sequence.config.maxApiCost - sequence.config.currentApiCost
            },
            tasks: sequence.tasks.map(task => ({
              description: task.description,
              completed: task.completed,
              completedAt: task.completedAt,
              apiCost: task.apiCost,
              decisions: task.decisions
            })),
            executionLog: sequence.executionLog
          }, null, 2),
        },
      ],
    };
  }

  private handleUpdateSequenceConfig(args: any) {
    const sequence = this.getCurrentSequence();
    
    if (args.maxApiCost !== undefined) {
      sequence.config.maxApiCost = args.maxApiCost;
    }
    if (args.autonomyLevel !== undefined) {
      sequence.config.autonomyLevel = args.autonomyLevel;
    }
    if (args.fallbackEnabled !== undefined) {
      sequence.config.fallbackEnabled = args.fallbackEnabled;
    }
    if (args.retryAttempts !== undefined) {
      sequence.config.retryAttempts = args.retryAttempts;
    }

    sequence.executionLog.push({
      timestamp: new Date(),
      action: 'config_updated',
      details: `Updated sequence configuration: ${JSON.stringify(args)}`
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Configuration updated successfully',
            config: sequence.config
          }, null, 2),
        },
      ],
    };
  }

  private getCurrentSequence(): TaskSequence {
    if (!this.currentSequenceId) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'No active task sequence'
      );
    }

    const sequence = this.sequences.get(this.currentSequenceId);
    if (!sequence) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Current sequence not found'
      );
    }

    return sequence;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Task Sequence MCP server running on stdio');
  }
}

const server = new TaskSequenceServer();
server.run().catch(console.error);