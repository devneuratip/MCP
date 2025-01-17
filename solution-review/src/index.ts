#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';

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

    constructor() {
        this.reviews = new Map();
        this.profile = {
            name: 'o1',
            type: 'roo_cline_profile'
        };

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

    private async suggestNewTasks(context: any): Promise<any> {
        try {
            // Solicitar ao task-orchestrator para criar novas tarefas
            const response = await this.server.sendRequest('enhanced-task-sequence', 'add_task_sequence', {
                name: `Tarefas Complementares: ${context.currentTask?.description || 'Análise Geral'}`,
                tasks: context.suggestedTasks || [],
                config: {
                    parentSequenceId: context.sequenceId,
                    maxApiCost: 100,
                    autonomyLevel: 'full'
                }
            });

            return JSON.parse(response.content[0].text);
        } catch (error) {
            logger.error('Erro ao sugerir novas tarefas:', error);
            return null;
        }
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
                },
                {
                    name: 'prompt_review',
                    description: 'Analisa e otimiza prompts de IA',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            prompt: {
                                type: 'string',
                                description: 'Prompt para analisar'
                            },
                            context: {
                                type: 'string',
                                description: 'Contexto de uso do prompt'
                            },
                            targetModel: {
                                type: 'string',
                                description: 'Modelo de IA alvo'
                            }
                        },
                        required: ['prompt']
                    }
                },
                {
                    name: 'project_validation',
                    description: 'Valida estrutura e práticas do projeto',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            projectPath: {
                                type: 'string',
                                description: 'Caminho do projeto'
                            },
                            checkList: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'Lista de aspectos para validar'
                            },
                            suggestTasks: {
                                type: 'boolean',
                                description: 'Se deve sugerir novas tarefas'
                            }
                        },
                        required: ['projectPath']
                    }
                },
                {
                    name: 'suggest_tasks',
                    description: 'Analisa o contexto e sugere novas tarefas',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            context: {
                                type: 'object',
                                description: 'Contexto atual do projeto/tarefa'
                            },
                            currentTask: {
                                type: 'object',
                                description: 'Detalhes da tarefa atual'
                            },
                            completedTasks: {
                                type: 'array',
                                items: {
                                    type: 'object'
                                },
                                description: 'Lista de tarefas já concluídas'
                            },
                            projectPath: {
                                type: 'string',
                                description: 'Caminho do projeto'
                            }
                        },
                        required: ['context']
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
                case 'prompt_review':
                    return await this.handlePromptReview(request.params.arguments);
                case 'project_validation':
                    return await this.handleProjectValidation(request.params.arguments);
                case 'suggest_tasks':
                    return await this.handleSuggestTasks(request.params.arguments);
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

            // Se houver contexto, analisar para possíveis novas tarefas
            if (args.context) {
                const taskSuggestions = await this.handleSuggestTasks({
                    context: args.context,
                    currentTask: {
                        type: 'code_review',
                        content: args.code
                    }
                });
                review.suggestedTasks = taskSuggestions.content[0].text;
            }

            this.reviews.set(reviewId, review);

            logger.info('Revisão de código realizada', {
                reviewId,
                language: review.language,
                profile: profile.role,
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

            const review = this.formatReviewOutput({
                solution: args.solution,
                context: args.context || {},
                requirements: args.requirements || [],
                reviewProfile: reviewProfile,
                analysis: {
                    architecturalConsiderations: [],
                    scalabilityAnalysis: [],
                    technicalTradeoffs: [],
                    recommendations: []
                },
                suggestedTasks: []
            });

            // Se solicitado, gerar sugestões de novas tarefas
            if (args.suggestTasks) {
                const taskSuggestions = await this.handleSuggestTasks({
                    context: args.context,
                    currentTask: {
                        type: 'solution_review',
                        content: args.solution
                    }
                });
                review.suggestedTasks = taskSuggestions.content[0].text;

                // Se houver sugestões, criar nova sequência de tarefas
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
            logger.error('Erro na análise de solução:', error);
            throw new McpError(ErrorCode.InternalError, `Erro na análise: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handlePromptReview(args: any) {
        try {
            const reviewProfile = REVIEW_PROFILES['prompt-engineer'];
            const reviewId = Math.random().toString(36).substring(2, 12);

            const review = this.formatReviewOutput({
                prompt: args.prompt,
                context: args.context,
                targetModel: args.targetModel,
                reviewProfile: reviewProfile,
                analysis: {
                    clarity: [],
                    effectiveness: [],
                    contextConsiderations: [],
                    improvements: []
                }
            });

            this.reviews.set(reviewId, review);

            logger.info('Análise de prompt realizada', {
                reviewId,
                profile: this.profile.name,
                reviewProfile: reviewProfile.role,
                targetModel: args.targetModel
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
            logger.error('Erro na análise de prompt:', error);
            throw new McpError(ErrorCode.InternalError, `Erro na análise: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleProjectValidation(args: any) {
        try {
            const reviewProfiles = [REVIEW_PROFILES['senior-dev'], REVIEW_PROFILES['architect']];
            const reviewId = Math.random().toString(36).substring(2, 12);

            const review = this.formatReviewOutput({
                projectPath: args.projectPath,
                checkList: args.checkList || [],
                reviewProfiles: reviewProfiles,
                validation: {
                    structureAnalysis: [],
                    bestPracticesCompliance: [],
                    architecturalConcerns: [],
                    recommendations: []
                },
                suggestedTasks: []
            });

            // Se solicitado, gerar sugestões de novas tarefas
            if (args.suggestTasks) {
                const taskSuggestions = await this.handleSuggestTasks({
                    context: {
                        projectPath: args.projectPath,
                        checkList: args.checkList
                    },
                    currentTask: {
                        type: 'project_validation',
                        content: 'Validação de projeto'
                    }
                });
                review.suggestedTasks = taskSuggestions.content[0].text;

                // Se houver sugestões, criar nova sequência de tarefas
                if (review.suggestedTasks.length > 0) {
                    const newSequence = await this.suggestNewTasks({
                        projectPath: args.projectPath,
                        suggestedTasks: review.suggestedTasks
                    });
                    review.newSequence = newSequence;
                }
            }

            this.reviews.set(reviewId, review);

            logger.info('Validação de projeto realizada', {
                reviewId,
                projectPath: args.projectPath,
                profile: this.profile.name,
                reviewProfiles: reviewProfiles.map((p: ReviewProfile) => p.role),
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
            logger.error('Erro na validação de projeto:', error);
            throw new McpError(ErrorCode.InternalError, `Erro na validação: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleSuggestTasks(args: any) {
        try {
            const suggestedTasks: { description: string; priority: number }[] = [];
            const context = args.context || {};
            const currentTask = args.currentTask || {};
            const completedTasks = args.completedTasks || [];

            // Analisar contexto e gerar sugestões de tarefas
            // Implementar lógica de análise e geração de sugestões aqui

            logger.info('Sugestão de tarefas realizada', {
                contextType: currentTask.type,
                suggestedCount: suggestedTasks.length
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            suggestedTasks,
                            context: {
                                currentTask,
                                completedTasks: completedTasks.length
                            }
                        }, null, 2)
                    }
                ]
            };
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