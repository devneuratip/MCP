#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

interface PipelineConfig {
  name: string;
  steps: string[];
  environment: Record<string, string>;
}

class CiCdPipelineServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'ci-cd-pipeline',
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
          name: 'create_pipeline',
          description: 'Create a new CI/CD pipeline configuration',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the pipeline',
              },
              steps: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'List of pipeline steps to execute',
              },
              environment: {
                type: 'object',
                additionalProperties: {
                  type: 'string',
                },
                description: 'Environment variables for the pipeline',
              },
            },
            required: ['name', 'steps'],
          },
        },
        {
          name: 'run_pipeline',
          description: 'Execute a configured pipeline',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the pipeline to run',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'get_pipeline_status',
          description: 'Get the current status of a pipeline',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the pipeline',
              },
            },
            required: ['name'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_pipeline':
          return this.handleCreatePipeline(request.params.arguments);
        case 'run_pipeline':
          return this.handleRunPipeline(request.params.arguments);
        case 'get_pipeline_status':
          return this.handleGetPipelineStatus(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleCreatePipeline(args: any): Promise<any> {
    if (!this.isValidPipelineConfig(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid pipeline configuration'
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `Pipeline '${args.name}' created successfully with ${args.steps.length} steps`,
        },
      ],
    };
  }

  private async handleRunPipeline(args: any): Promise<any> {
    if (!args.name || typeof args.name !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Pipeline name is required'
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `Pipeline '${args.name}' started execution`,
        },
      ],
    };
  }

  private async handleGetPipelineStatus(args: any): Promise<any> {
    if (!args.name || typeof args.name !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Pipeline name is required'
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `Pipeline '${args.name}' status: pending`,
        },
      ],
    };
  }

  private isValidPipelineConfig(config: any): config is PipelineConfig {
    return (
      typeof config === 'object' &&
      typeof config.name === 'string' &&
      Array.isArray(config.steps) &&
      config.steps.every((step: any) => typeof step === 'string') &&
      (!config.environment || typeof config.environment === 'object')
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('CI/CD Pipeline MCP server running on stdio');
  }
}

const server = new CiCdPipelineServer();
server.run().catch(console.error);