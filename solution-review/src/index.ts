#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import { SolutionAnalyzer } from './analyzer.js';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        })
    ]
});

interface ReviewProfile {
    role: string;
    expertise: string[];
    focusAreas: string[];
}

const REVIEW_PROFILES: { [key: string]: ReviewProfile } = {
    'senior-dev': {
        role: 'Desenvolvedor Sênior',
        expertise: ['Código', 'Performance', 'Segurança', 'Boas Práticas'],
        focusAreas: ['Qualidade de Código', 'Padrões de Projeto', 'Manutenibilidade']
    },
    'architect': {
        role: 'Arquiteto de Soluções',
        expertise: ['Arquitetura', 'Escalabilidade', 'Integração', 'Tecnologias'],
        focusAreas: ['Design de Sistema', 'Escolha de Tecnologias', 'Trade-offs']
    },
    'prompt-engineer': {
        role: 'Engenheiro de Prompts',
        expertise: ['IA', 'NLP', 'Engenharia de Prompts', 'Contexto'],
        focusAreas: ['Eficácia de Prompts', 'Clareza', 'Consistência']
    }
};

class SolutionReviewServer {
    private server: Server;
    private reviews: Map<string, any>;
    private profile: { name: string; type: string };
    private analyzer: SolutionAnalyzer;

    constructor() {
        this.reviews = new Map();
        this.profile = {
            name: 'o1',
            type: 'roo_cline_profile'
        };
        this.analyzer = new SolutionAnalyzer();

        this.server = new Server({
            name: 'solution-review',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });

        this.setupToolHandlers();
        this.server.onerror = (error) => logger.error('MCP Error:', error);

        logger.info('Solution Review Server iniciado', {
            profile: this.profile
        });
    }

    private formatReviewOutput(review: any) {
        return {
            ...review,
            profile: this.profile,
            timestamp: new Date().toISOString()
        };
    }

    private async makeRequest(method: string, params: any): Promise<any> {
        try {
            const response = await (this.server as any).request({
                method,
                params: { ...params, _meta: {} }
            });

            if (response?.content?.[0]?.text) {
                return JSON.parse(response.content[0].text);
            }
            return null;
        } catch (error) {
            logger.error(`Erro ao fazer requisição ${method}:`, error);
            return null;
        }
    }

    private async suggestNewTasks(context: any): Promise<any> {
        return await this.makeRequest('add_task_sequence', {
            name: `Tarefas Complementares: ${context.currentTask?.description || 'Análise Geral'}`,
            tasks: context.suggestedTasks || [],
            config: {
                parentSequenceId: context.sequenceId,
                maxApiCost: 100,
                autonomyLevel: 'full'
            }
        });
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'code_review',
                    description: 'Realiza revisão de código com perspectiva de desenvolvedor sênior',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            code: {
                                type: 'string',
                                description: 'Código para revisar'
                            },
                            language: {
                                type: 'string',
                                description: 'Linguagem de programação'
                            },
                            focusAreas: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'Áreas específicas para focar na revisão'
                            },
                            context: {
                                type: 'object',
                                description: 'Contexto adicional do código'
                            }
                        },
                        required: ['code']
                    }
                },
                {
                    name: 'solution_review',
                    description: 'Analisa uma solução técnica com perspectiva de arquiteto',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            solution: {
                                type: 'string',
                                description: 'Descrição da solução'
                            },
                            context: {
                                type: 'object',
                                description: 'Contexto do projeto'
                            },
                            requirements: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'Requisitos do projeto'
                            },
                            suggestTasks: {
                                type: 'boolean',
                                description: 'Se deve sugerir novas tarefas'
                            }
                        },
                        required: ['solution']
                    }
                }
            ]
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            switch (request.params.name) {
                case 'code_review':
                    return await this.handleCodeReview(request.params.arguments);
                case 'solution_review':
                    return await this.handleSolutionReview(request.params.arguments);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Ferramenta desconhecida: ${request.params.name}`);
            }
        });
    }

    private async handleCodeReview(args: any) {
        try {
            const reviewProfile = REVIEW_PROFILES['senior-dev'];
            const reviewId = Math.random().toString(36).substring(2, 12);

            const review = this.formatReviewOutput({
                code: args.code,
                language: args.language || 'javascript',
                focusAreas: args.focusAreas || reviewProfile.focusAreas,
                reviewProfile: reviewProfile,
                findings: {
                    qualityIssues: [],
                    suggestions: [],
                    bestPractices: [],
                    securityConcerns: []
                },
                suggestedTasks: []
            });

            if (args.context) {
                const taskSuggestions = await this.handleSuggestTasks({
                    context: args.context,
                    currentTask: {
                        type: 'code_review',
                        content: args.code
                    }
                });
                review.suggestedTasks = taskSuggestions;
            }

            this.reviews.set(reviewId, review);

            logger.info('Revisão de código realizada', {
                reviewId,
                language: review.language,
                profile: reviewProfile.role,
                hasSuggestedTasks: review.suggestedTasks.length > 0
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(review, null, 2)
                    }
                ]
            };
        } catch (error) {
            logger.error('Erro na revisão de código:', error);
            throw new McpError(ErrorCode.InternalError, `Erro na revisão: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleSolutionReview(args: any) {
        try {
            const reviewProfile = REVIEW_PROFILES['architect'];
            const reviewId = Math.random().toString(36).substring(2, 12);

            // Usar o analyzer para gerar análises detalhadas
            const analysis = this.analyzer.analyze(args.solution, args.context);

            const review = this.formatReviewOutput({
                reviewId,
                solution: args.solution,
                context: args.context || {},
                requirements: args.requirements || [],
                reviewProfile: reviewProfile,
                analysis,
                suggestedTasks: []
            });

            if (args.suggestTasks) {
                const taskSuggestions = await this.handleSuggestTasks({
                    context: args.context,
                    currentTask: {
                        type: 'solution_review',
                        content: args.solution
                    }
                });
                review.suggestedTasks = taskSuggestions;

                if (review.suggestedTasks.length > 0) {
                    const newSequence = await this.suggestNewTasks({
                        sequenceId: args.context?.sequenceId,
                        currentTask: args.context?.currentTask,
                        suggestedTasks: review.suggestedTasks
                    });
                    review.newSequence = newSequence;
                }
            }

            this.reviews.set(reviewId, review);

            logger.info('Análise de solução realizada', {
                reviewId,
                profile: this.profile.name,
                reviewProfile: reviewProfile.role,
                hasSuggestedTasks: review.suggestedTasks.length > 0,
                analysisPoints: {
                    architectural: analysis.architecturalConsiderations.length,
                    scalability: analysis.scalabilityAnalysis.length,
                    tradeoffs: analysis.technicalTradeoffs.length,
                    recommendations: analysis.recommendations.length
                }
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(review, null, 2)
                    }
                ]
            };
        } catch (error) {
            logger.error('Erro na análise de solução:', error);
            throw new McpError(ErrorCode.InternalError, `Erro na análise: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleSuggestTasks(args: any) {
        try {
            const suggestedTasks: { description: string; priority: number }[] = [];
            const context = args.context || {};
            const currentTask = args.currentTask || {};

            // Analisar contexto e gerar sugestões de tarefas baseadas na análise
            if (currentTask.type === 'solution_review') {
                const analysis = this.analyzer.analyze(currentTask.content, context);
                analysis.recommendations.forEach((recommendation, index) => {
                    suggestedTasks.push({
                        description: `Implementar: ${recommendation}`,
                        priority: index + 1
                    });
                });
            }

            logger.info('Sugestão de tarefas realizada', {
                contextType: currentTask.type,
                suggestedCount: suggestedTasks.length
            });

            return suggestedTasks;
        } catch (error) {
            logger.error('Erro ao sugerir tarefas:', error);
            throw new McpError(ErrorCode.InternalError, `Erro na sugestão: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info('Solution Review MCP server iniciado');
    }
}

const server = new SolutionReviewServer();
server.run().catch((error) => {
    logger.error('Erro fatal:', error);
    process.exit(1);
});