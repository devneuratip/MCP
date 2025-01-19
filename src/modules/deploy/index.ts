#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ProviderFactory } from './providers/factory.js';
import { DeployConfig } from './providers/interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

class DeployServer {
    private server: Server;
    private provider: any;

    constructor(providerType: string = 'vercel') {
        this.provider = ProviderFactory.create(providerType);

        this.server = new Server({
            name: 'deploy-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });

        this.setupToolHandlers();
        this.server.onerror = (error) => console.error('MCP Error:', error);
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'deploy_project',
                    description: 'Deploy project to cloud provider',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to project directory',
                            },
                            projectName: {
                                type: 'string',
                                description: 'Name of the project',
                            },
                            framework: {
                                type: 'string',
                                description: 'Framework being used (optional)',
                            },
                            teamId: {
                                type: 'string',
                                description: 'Team ID for deployment (optional)',
                            },
                            environmentVariables: {
                                type: 'object',
                                description: 'Environment variables for the deployment',
                                additionalProperties: {
                                    type: 'string',
                                },
                            },
                        },
                        required: ['projectPath', 'projectName'],
                    },
                },
                {
                    name: 'validate_project',
                    description: 'Validate project structure and configuration',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to project directory',
                            },
                        },
                        required: ['projectPath'],
                    },
                },
                {
                    name: 'generate_config',
                    description: 'Generate deployment configuration',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to project directory',
                            },
                            framework: {
                                type: 'string',
                                description: 'Framework being used',
                            },
                        },
                        required: ['projectPath', 'framework'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params.arguments) {
                throw new McpError(ErrorCode.InvalidParams, 'Arguments are required');
            }

            const args = request.params.arguments;
            switch (request.params.name) {
                case 'deploy_project':
                    return await this.handleDeploy(args);
                case 'validate_project':
                    return await this.handleValidate(args);
                case 'generate_config':
                    return await this.handleGenerateConfig(args);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }

    private async handleDeploy(args: any) {
        try {
            const config: DeployConfig = {
                projectPath: args.projectPath,
                projectName: args.projectName,
                framework: args.framework,
                teamId: args.teamId,
                environmentVariables: args.environmentVariables,
            };

            const result = await this.provider.deploy(config);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Deploy failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleValidate(args: any) {
        try {
            const result = await this.provider.validateProject(args.projectPath);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Validation failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleGenerateConfig(args: any) {
        try {
            const result = await this.provider.generateConfig(args.projectPath, args.framework);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Config generation failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('Deploy Server running on stdio');
    }
}

const server = new DeployServer();
server.run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});