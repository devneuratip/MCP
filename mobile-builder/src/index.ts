#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { execa } from 'execa';

interface ProjectConfig {
  name: string;
  bundle_id: string;
  version: string;
  build_number: number;
  dependencies: Record<string, string>;
  environment: 'development' | 'staging' | 'production';
}

interface BuildConfig {
  platform: 'android' | 'ios' | 'both';
  mode: 'debug' | 'release';
  optimization: {
    minify: boolean;
    split_chunks: boolean;
    tree_shaking: boolean;
  };
  environment_vars: Record<string, string>;
}

interface DeviceConfig {
  type: 'simulator' | 'physical';
  platform: 'android' | 'ios';
  id?: string;
}

class MobileBuilderServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mobile-builder',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_project',
          description: 'Create a new mobile project',
          inputSchema: {
            type: 'object',
            properties: {
              framework: {
                type: 'string',
                enum: ['flutter', 'react-native', 'expo'],
                description: 'Mobile framework to use'
              },
              name: {
                type: 'string',
                description: 'Project name'
              },
              template: {
                type: 'string',
                description: 'Project template to use'
              },
              config: {
                type: 'object',
                description: 'Project configuration',
                properties: {
                  bundle_id: { type: 'string' },
                  version: { type: 'string' },
                  build_number: { type: 'number' },
                  dependencies: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                  },
                  environment: {
                    type: 'string',
                    enum: ['development', 'staging', 'production']
                  }
                },
                required: ['bundle_id', 'version']
              }
            },
            required: ['framework', 'name']
          }
        },
        {
          name: 'build_app',
          description: 'Build mobile application',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to project directory'
              },
              platform: {
                type: 'string',
                enum: ['android', 'ios', 'both'],
                description: 'Target platform'
              },
              mode: {
                type: 'string',
                enum: ['debug', 'release'],
                description: 'Build mode'
              },
              config: {
                type: 'object',
                description: 'Build configuration',
                properties: {
                  optimization: {
                    type: 'object',
                    properties: {
                      minify: { type: 'boolean' },
                      split_chunks: { type: 'boolean' },
                      tree_shaking: { type: 'boolean' }
                    }
                  },
                  environment_vars: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                  }
                }
              }
            },
            required: ['project_path', 'platform', 'mode']
          }
        },
        {
          name: 'run_tests',
          description: 'Run mobile app tests',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to project directory'
              },
              type: {
                type: 'string',
                enum: ['unit', 'integration', 'e2e'],
                description: 'Type of tests to run'
              },
              device: {
                type: 'object',
                description: 'Device configuration for tests',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['simulator', 'physical']
                  },
                  platform: {
                    type: 'string',
                    enum: ['android', 'ios']
                  },
                  id: { type: 'string' }
                },
                required: ['type', 'platform']
              }
            },
            required: ['project_path', 'type']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_project':
          return this.handleCreateProject(request.params.arguments);
        case 'build_app':
          return this.handleBuildApp(request.params.arguments);
        case 'run_tests':
          return this.handleRunTests(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleCreateProject(args: any) {
    try {
      const { framework, name, template, config } = args;

      let command: string;
      let commandArgs: string[];

      switch (framework) {
        case 'flutter':
          command = 'flutter';
          commandArgs = ['create', name];
          break;
        case 'react-native':
          command = 'npx';
          commandArgs = ['react-native', 'init', name];
          break;
        case 'expo':
          command = 'npx';
          commandArgs = ['create-expo-app', name];
          break;
        default:
          throw new Error(`Unsupported framework: ${framework}`);
      }

      const result = await execa(command, commandArgs);

      return {
        content: [
          {
            type: 'text',
            text: `Project ${name} created successfully with ${framework}\n${result.stdout}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create project: ${error}`
      );
    }
  }

  private async handleBuildApp(args: any) {
    try {
      const { project_path, platform, mode, config } = args;

      // Implementar lógica de build específica para cada framework
      // Por enquanto retorna mock
      return {
        content: [
          {
            type: 'text',
            text: `Building app for ${platform} in ${mode} mode\nPath: ${project_path}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to build app: ${error}`
      );
    }
  }

  private async handleRunTests(args: any) {
    try {
      const { project_path, type, device } = args;

      // Implementar lógica de testes específica para cada framework
      // Por enquanto retorna mock
      return {
        content: [
          {
            type: 'text',
            text: `Running ${type} tests\nPath: ${project_path}\nDevice: ${JSON.stringify(device)}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to run tests: ${error}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Mobile Builder MCP server running on stdio');
  }
}

const server = new MobileBuilderServer();
server.run().catch(console.error);