#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, McpError, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { detectProjectStructure, validateProject } from './utils/project-utils.js';
import { VercelAPI } from './utils/vercel-api.js';
import { DeployArgs, VercelConfig } from './types.js';

// Carrega as variáveis de ambiente
config({ path: resolve(process.cwd(), '.env') });

class VercelDeployV2Server {
    private server: Server;
    private vercelApi: VercelAPI;

    constructor() {
        const token = process.env.VERCEL_TOKEN;
        if (!token) {
            throw new McpError(ErrorCode.InvalidParams, 'VERCEL_TOKEN environment variable is required');
        }
        this.vercelApi = new VercelAPI(token);

        this.server = new Server({
            name: 'vercel-deploy-v2',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {
                    verify_compatibility: {
                        description: 'Verify project compatibility with Vercel',
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
                    validate_structure: {
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
                    generate_config: {
                        description: 'Generate Vercel configuration for a project',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                projectPath: {
                                    type: 'string',
                                    description: 'Path to project directory',
                                },
                                framework: {
                                    type: 'string',
                                    description: 'Framework being used (e.g., nextjs, react, vue)',
                                },
                            },
                            required: ['projectPath', 'framework'],
                        },
                    },
                    deploy_project: {
                        description: 'Deploy project to Vercel',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                projectPath: {
                                    type: 'string',
                                    description: 'Path to project directory',
                                },
                                projectName: {
                                    type: 'string',
                                    description: 'Name of the project in Vercel',
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
                },
            },
        });
        this.setupHandlers();
    }

    private setupHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'verify_compatibility',
                    description: 'Verify project compatibility with Vercel',
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
                    name: 'validate_structure',
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
                    description: 'Generate Vercel configuration for a project',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to project directory',
                            },
                            framework: {
                                type: 'string',
                                description: 'Framework being used (e.g., nextjs, react, vue)',
                            },
                        },
                        required: ['projectPath', 'framework'],
                    },
                },
                {
                    name: 'deploy_project',
                    description: 'Deploy project to Vercel',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Path to project directory',
                            },
                            projectName: {
                                type: 'string',
                                description: 'Name of the project in Vercel',
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
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params.arguments) {
                throw new McpError(ErrorCode.InvalidParams, 'Arguments are required');
            }
            const args = request.params.arguments;
            switch (request.params.name) {
                case 'verify_compatibility':
                    return this.verifyCompatibility(args);
                case 'validate_structure':
                    return this.validateStructure(args);
                case 'generate_config':
                    return this.generateConfig(args);
                case 'deploy_project':
                    return this.deployProject(args);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }

    private async verifyCompatibility(args: any) {
        if (!args.projectPath || typeof args.projectPath !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'projectPath is required and must be a string');
        }

        try {
            const structure = await detectProjectStructure(args.projectPath);
            const validation = await validateProject(args.projectPath);
            
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        structure,
                        validation,
                        isCompatible: validation.isValid
                    }, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(ErrorCode.InternalError, `Error verifying compatibility: ${message}`);
        }
    }

    private async validateStructure(args: any) {
        if (!args.projectPath || typeof args.projectPath !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'projectPath is required and must be a string');
        }

        try {
            const validation = await validateProject(args.projectPath);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(validation, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(ErrorCode.InternalError, `Error validating structure: ${message}`);
        }
    }

    private async generateConfig(args: any) {
        if (!args.projectPath || typeof args.projectPath !== 'string' ||
            !args.framework || typeof args.framework !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'projectPath and framework are required and must be strings');
        }

        try {
            const structure = await detectProjectStructure(args.projectPath);
            const config: VercelConfig = {
                framework: args.framework,
                buildCommand: '',
                outputDirectory: '',
            };

            switch (args.framework.toLowerCase()) {
                case 'nextjs':
                    config.buildCommand = 'next build';
                    config.outputDirectory = '.next';
                    break;
                case 'react':
                case 'create-react-app':
                    config.buildCommand = 'react-scripts build';
                    config.outputDirectory = 'build';
                    break;
                case 'vue':
                    config.buildCommand = 'vue-cli-service build';
                    config.outputDirectory = 'dist';
                    break;
                default:
                    config.buildCommand = 'npm run build';
                    config.outputDirectory = 'build';
            }

            if (structure.isMonorepo && structure.clientPath) {
                config.buildCommand = `cd ${structure.clientPath} && ${config.buildCommand}`;
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(config, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(ErrorCode.InternalError, `Error generating config: ${message}`);
        }
    }

    private async deployProject(args: any) {
        if (!args.projectPath || typeof args.projectPath !== 'string' ||
            !args.projectName || typeof args.projectName !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'projectPath and projectName are required and must be strings');
        }

        try {
            const validation = await validateProject(args.projectPath);
            if (!validation.isValid) {
                throw new McpError(ErrorCode.InvalidParams, `Project validation failed: ${validation.errors.join(', ')}`);
            }

            const deployArgs: DeployArgs = {
                projectPath: args.projectPath,
                projectName: args.projectName,
            };

            if (args.framework && typeof args.framework === 'string') {
                deployArgs.framework = args.framework;
            }
            if (args.teamId && typeof args.teamId === 'string') {
                deployArgs.teamId = args.teamId;
            }
            if (args.environmentVariables && typeof args.environmentVariables === 'object') {
                const envVars: Record<string, string> = {};
                Object.entries(args.environmentVariables).forEach(([key, value]) => {
                    if (typeof value === 'string') {
                        envVars[key] = value;
                    }
                });
                deployArgs.environmentVariables = envVars;
            }

            const result = await this.vercelApi.createDeployment(deployArgs);
            if (result.error) {
                throw new McpError(ErrorCode.InternalError, `Deployment failed: ${result.error}`);
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(ErrorCode.InternalError, `Error deploying project: ${message}`);
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Vercel Deploy V2 MCP server running on stdio');
    }
}

const server = new VercelDeployV2Server();
server.run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Fatal error:', message);
    process.exit(1);
});