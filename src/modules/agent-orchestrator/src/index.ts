#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import {
    AgentConfig,
    AgentRequest,
    AgentResponse,
    AgentContext,
    AgentRegistry,
    AgentMetrics
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class AgentOrchestratorServer {
    private server: Server;
    private registry: AgentRegistry;
    private metrics: Map<string, AgentMetrics>;
    private activeContexts: Map<string, AgentContext>;
    private agentsBasePath: string;

    constructor() {
        this.server = new Server({
            name: 'agent-orchestrator',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });

        this.agentsBasePath = resolve(__dirname, '../../../../Agentes/agents');
        this.registry = {
            agents: new Map(),
            contextRules: new Map(),
            capabilityMap: new Map(),
        };
        this.metrics = new Map();
        this.activeContexts = new Map();

        this.setupToolHandlers();
        this.loadAgentConfigurations();
        this.server.onerror = (error: Error): void => this.handleError(error);
    }

    private async loadAgentConfigurations() {
        try {
            const configPath = resolve(this.agentsBasePath, '../agents-config.json');
            const config = JSON.parse(await readFile(configPath, 'utf-8'));

            const contextRulesPath = resolve(this.agentsBasePath, '../communication-hub.json');
            const contextRules = JSON.parse(await readFile(contextRulesPath, 'utf-8'));

            if (config.default && config.default.agents) {
                for (const agent of config.default.agents) {
                    this.registry.agents.set(agent.id, agent);
                    
                    // Mapear capacidades para agentes
                    agent.capabilities.forEach((capability: string) => {
                        const agents = this.registry.capabilityMap.get(capability) || [];
                        agents.push(agent.id);
                        this.registry.capabilityMap.set(capability, agents);
                    });

                    // Inicializar métricas
                    this.metrics.set(agent.id, {
                        invocations: 0,
                        successRate: 1,
                        averageResponseTime: 0,
                        lastUsed: new Date(),
                        commonTasks: [],
                    });
                }
            }

            if (contextRules.default && contextRules.default.contextMapping) {
                for (const [context, agents] of Object.entries(contextRules.default.contextMapping)) {
                    this.registry.contextRules.set(context, agents as string[]);
                }
            }
        } catch (error) {
            console.error('Error loading agent configurations:', error);
            throw error;
        }
    }

    private setupToolHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'select_agent',
                    description: 'Seleciona o agente mais apropriado para uma tarefa',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            context: {
                                type: 'string',
                                description: 'Contexto da tarefa',
                            },
                            task: {
                                type: 'string',
                                description: 'Descrição da tarefa',
                            },
                            requiredCapabilities: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Capacidades necessárias',
                            },
                        },
                        required: ['context', 'task'],
                    },
                },
                {
                    name: 'consult_agent',
                    description: 'Consulta um agente específico',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            agentId: {
                                type: 'string',
                                description: 'ID do agente',
                            },
                            task: {
                                type: 'string',
                                description: 'Tarefa a ser consultada',
                            },
                            metadata: {
                                type: 'object',
                                description: 'Metadados adicionais',
                            },
                        },
                        required: ['agentId', 'task'],
                    },
                },
                {
                    name: 'get_agent_metrics',
                    description: 'Obtém métricas de um agente',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            agentId: {
                                type: 'string',
                                description: 'ID do agente',
                            },
                        },
                        required: ['agentId'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params.arguments) {
                throw new McpError(ErrorCode.InvalidParams, 'Arguments are required');
            }

            const args = request.params.arguments as Record<string, unknown>;
            switch (request.params.name) {
                case 'select_agent':
                    return await this.handleSelectAgent({
                        context: args.context as string,
                        task: args.task as string,
                        requiredCapabilities: args.requiredCapabilities as string[] | undefined,
                        metadata: args.metadata as Record<string, any> | undefined
                    });
                case 'consult_agent':
                    return await this.handleConsultAgent({
                        agentId: args.agentId as string,
                        task: args.task as string,
                        metadata: args.metadata as Record<string, any> | undefined
                    });
                case 'get_agent_metrics':
                    return await this.handleGetAgentMetrics({
                        agentId: args.agentId as string
                    });
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }

    private async handleSelectAgent(args: AgentRequest) {
        try {
            const { context, task, requiredCapabilities } = args;
            let bestAgent: AgentConfig | null = null;
            let highestPriority = -1;

            // Primeiro, verificar regras de contexto
            const contextAgents = this.registry.contextRules.get(context) || [];
            
            // Depois, verificar capacidades necessárias
            const capableAgents = new Set<string>();
            if (requiredCapabilities) {
                requiredCapabilities.forEach(cap => {
                    const agents = this.registry.capabilityMap.get(cap) || [];
                    agents.forEach(a => capableAgents.add(a));
                });
            }

            // Combinar resultados e encontrar o melhor agente
            for (const agent of this.registry.agents.values()) {
                if (
                    (contextAgents.includes(agent.id) || contextAgents.length === 0) &&
                    (capableAgents.size === 0 || capableAgents.has(agent.id)) &&
                    agent.priority > highestPriority
                ) {
                    bestAgent = agent;
                    highestPriority = agent.priority;
                }
            }

            if (!bestAgent) {
                throw new McpError(ErrorCode.InvalidRequest, 'No suitable agent found for the task');
            }

            // Atualizar métricas
            const metrics = this.metrics.get(bestAgent.id);
            if (metrics) {
                metrics.invocations++;
                metrics.lastUsed = new Date();
                if (!metrics.commonTasks.includes(task)) {
                    metrics.commonTasks.push(task);
                }
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        selectedAgent: bestAgent,
                        reason: `Selected based on context "${context}" and priority ${bestAgent.priority}`,
                    }),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Agent selection failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleConsultAgent(args: { agentId: string; task: string; metadata?: Record<string, any> }) {
        try {
            const { agentId, task, metadata } = args;
            const agent = this.registry.agents.get(agentId);
            
            if (!agent) {
                throw new McpError(ErrorCode.InvalidRequest, `Agent ${agentId} not found`);
            }

            // Carregar base de conhecimento do agente
            const knowledgeBasePath = resolve(this.agentsBasePath, agent.type, 'resources/knowledge-base');
            
            // Simular consulta ao agente (em produção, isso seria uma chamada real ao agente)
            const response: AgentResponse = {
                agentId,
                response: `Consulta simulada ao agente ${agent.name} para tarefa: ${task}`,
                suggestions: ['Sugestão 1', 'Sugestão 2'],
                nextSteps: [
                    {
                        tool: 'validate_code',
                        server: 'quality-control',
                        params: { /* parâmetros relevantes */ }
                    }
                ]
            };

            // Atualizar métricas
            const metrics = this.metrics.get(agentId);
            if (metrics) {
                metrics.invocations++;
                metrics.lastUsed = new Date();
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(response),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Agent consultation failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleGetAgentMetrics(args: { agentId: string }) {
        try {
            const { agentId } = args;
            const metrics = this.metrics.get(agentId);
            
            if (!metrics) {
                throw new McpError(ErrorCode.InvalidRequest, `Metrics for agent ${agentId} not found`);
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(metrics),
                }],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to get agent metrics: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private handleError(error: Error): void {
        console.error('Server error:', error);
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('Agent Orchestrator Server running on stdio');
    }
}

const server = new AgentOrchestratorServer();
void server.run().catch((error: Error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});