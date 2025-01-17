#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { detectProjectStructure, validateProject } from './utils/project-utils.ts';

// Carrega as variáveis de ambiente
config({ path: resolve(process.cwd(), '.env') });

class VercelDeployV2Server {
    private server: Server;

    constructor() {
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
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params.arguments) {
                throw new McpError(ErrorCode.InvalidParams, 'Arguments are required');
            }
            const args = request.params.arguments;
            switch (request.params.name) {
                case 'verify_compatibility':
                    return this.verifyCompatibility(args);
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

    private async deployProject(args: any) {
        // Implementação será adicionada
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ status: 'Deployment not implemented yet' }, null, 2)
            }]
        };
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