#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ProviderFactory } from './providers/factory.js';
import { DeployConfig } from './providers/interface.js';
import { KnowledgeBase } from './docs/knowledge-base.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

class DeployServer {
    private server: Server;
    private provider: any;
    private knowledgeBase: KnowledgeBase;

    constructor(providerType: string = 'vercel') {
        this.provider = ProviderFactory.create(providerType);
        this.knowledgeBase = KnowledgeBase.getInstance();

        this.server = new Server({
            name: 'deploy-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });

        this.setupToolHandlers();
        this.server.onerror = (error: Error): void => this.handleError(error);
    }

    private setupToolHandlers(): void {
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
                    name: 'search_docs',
                    description: 'Search deployment documentation',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Search query',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'get_deployment_guide',
                    description: 'Get deployment guide',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
                {
                    name: 'get_template_info',
                    description: 'Get template information',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            templateType: {
                                type: 'string',
                                description: 'Type of template (e.g., next, app-router)',
                            },
                        },
                        required: ['templateType'],
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
                case 'search_docs':
                    return await this.handleSearchDocs(args);
                case 'get_deployment_guide':
                    return await this.handleGetDeploymentGuide();
                case 'get_template_info':
                    return await this.handleGetTemplateInfo(args);
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

    private async handleSearchDocs(args: any) {
        const { query } = args;
        try {
            const results = await this.knowledgeBase.searchDocs(query);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(results, null, 2),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Documentation search failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleGetDeploymentGuide() {
        try {
            const guide = await this.knowledgeBase.getDeploymentGuide();
            if (!guide) {
                throw new McpError(ErrorCode.InvalidRequest, 'Deployment guide not found');
            }
            return {
                content: [{
                    type: 'text',
                    text: guide,
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to get deployment guide: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleGetTemplateInfo(args: any) {
        const { templateType } = args;
        try {
            const templates = await this.knowledgeBase.getTemplateInfo(templateType);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(templates, null, 2),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to get template info: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleReportError(args: { error: Error; context?: any }): Promise<any> {
        try {
            const response = await fetch('http://localhost:3000/report-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(args),
            });
            return response.ok;
        } catch {
            // Silently fail if error reporting fails
            return false;
        }
    }

    private handleError(error: Error): void {
        console.error('Server error:', error);
        void this.handleReportError({
            error,
            context: {
                component: 'deploy-server',
                internal: true,
            },
        });
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('Deploy Server running on stdio');
    }
}

const server = new DeployServer();
void server.run().catch((error: Error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});