#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types';

interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  checkpoint?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskSequence {
  id: string;
  name: string;
  tasks: Task[];
  currentTaskIndex: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
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

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'add_task_sequence',
          description: 'Add a new task sequence with a list of tasks to be executed autonomously',
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
                  type: 'object',
                  properties: {
                    description: {
                      type: 'string',
                      description: 'Description of the task to be executed',
                    },
                    checkpoint: {
                      type: 'string',
                      description: 'Optional checkpoint identifier for progress tracking',
                    },
                  },
                  required: ['description'],
                },
                description: 'List of tasks to be executed in sequence',
              },
            },
            required: ['name', 'tasks'],
          },
        },
        {
          name: 'get_sequence_status',
          description: 'Get the current status of a task sequence',
          inputSchema: {
            type: 'object',
            properties: {
              sequenceId: {
                type: 'string',
                description: 'ID of the task sequence',
              },
            },
            required: ['sequenceId'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'add_task_sequence':
          return this.handleAddTaskSequence(request.params.arguments);
        case 'get_sequence_status':
          return this.handleGetSequenceStatus(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private handleAddTaskSequence(args: any): { content: { type: string; text: string }[] } {
    if (!args.name || typeof args.name !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid sequence name: must be a non-empty string'
      );
    }

    if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Tasks must be a non-empty array'
      );
    }

    // Validate task descriptions
    args.tasks.forEach((task: any, index: number) => {
      if (!task.description || typeof task.description !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid task description at index ${index}`
        );
      }
      if (task.checkpoint && typeof task.checkpoint !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid checkpoint at index ${index}`
        );
      }
    });

    const sequenceId = this.generateId();
    const now = new Date();

    const tasks: Task[] = args.tasks.map((task: any) => ({
      id: this.generateId(),
      description: task.description,
      checkpoint: task.checkpoint,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }));

    const sequence: TaskSequence = {
      id: sequenceId,
      name: args.name,
      tasks,
      currentTaskIndex: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    this.sequences.set(sequenceId, sequence);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Task sequence created successfully',
            sequenceId,
            taskCount: tasks.length,
          }, null, 2),
        },
      ],
    };
  }

  private handleGetSequenceStatus(args: any): { content: { type: string; text: string }[] } {
    if (!args.sequenceId || typeof args.sequenceId !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid sequence ID: must be a non-empty string'
      );
    }

    const sequence = this.sequences.get(args.sequenceId);
    if (!sequence) {
      throw new McpError(
        ErrorCode.NotFound,
        `Task sequence not found: ${args.sequenceId}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: sequence.id,
            name: sequence.name,
            status: sequence.status,
            currentTaskIndex: sequence.currentTaskIndex,
            tasks: sequence.tasks.map(task => ({
              id: task.id,
              description: task.description,
              status: task.status,
              checkpoint: task.checkpoint,
              error: task.error,
            })),
          }, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Task Sequence MCP server running on stdio');
  }
}

const server = new TaskSequenceServer();
server.run().catch(console.error);
