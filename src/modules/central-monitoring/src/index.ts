#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ErrorContext, ErrorFilters, AlertRule, SystemMetrics, EnhancedTaskEvent } from './types.js';
import * as os from 'os';
import { EventEmitter } from 'events';

interface LogEventArgs {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    context?: ErrorContext;
}

interface ReportErrorArgs {
    error: Error;
    context?: ErrorContext;
}

interface ConfigureAlertArgs {
    rule: Omit<AlertRule, 'id'>;
}

class CentralMonitoringServer {
    private server: Server;
    private eventEmitter: EventEmitter;
    private errorLogs: Map<string, any>;
    private alertRules: Map<string, AlertRule>;
    private activeAlerts: Map<string, any>;
    private taskEvents: Map<string, EnhancedTaskEvent[]>;

    constructor() {
        this.server = new Server({
            name: 'central-monitoring',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });

        this.eventEmitter = new EventEmitter();
        this.errorLogs = new Map();
        this.alertRules = new Map();
        this.activeAlerts = new Map();
        this.taskEvents = new Map();

        this.setupToolHandlers();
        this.setupEventListeners();
        this.server.onerror = (error: Error): void => this.handleError(error);
    }

    private setupEventListeners(): void {
        this.eventEmitter.on('task-event', (event: EnhancedTaskEvent) => {
            const events = this.taskEvents.get(event.sequenceId) || [];
            events.push(event);
            this.taskEvents.set(event.sequenceId, events);

            if (event.type === 'error') {
                this.checkAlertRules(event);
            }
        });
    }

    private setupToolHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'log_event',
                    description: 'Registra um evento no sistema',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            level: {
                                type: 'string',
                                enum: ['info', 'warn', 'error', 'debug'],
                            },
                            message: {
                                type: 'string',
                            },
                            context: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        },
                        required: ['level', 'message'],
                    },
                },
                {
                    name: 'report_error',
                    description: 'Reporta um erro para análise',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            error: {
                                type: 'object',
                                properties: {
                                    message: { type: 'string' },
                                    stack: { type: 'string' },
                                },
                                required: ['message'],
                            },
                            context: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        },
                        required: ['error'],
                    },
                },
                {
                    name: 'get_system_metrics',
                    description: 'Obtém métricas do sistema',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
                {
                    name: 'configure_alert',
                    description: 'Configura uma regra de alerta',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            rule: {
                                type: 'object',
                                properties: {
                                    condition: { type: 'string' },
                                    threshold: { type: 'number' },
                                    action: {
                                        type: 'string',
                                        enum: ['notify', 'rollback', 'restart'],
                                    },
                                },
                                required: ['condition', 'threshold', 'action'],
                            },
                        },
                        required: ['rule'],
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
                case 'log_event': {
                    const { level, message, context } = args as Record<string, unknown>;
                    if (typeof level !== 'string' || typeof message !== 'string') {
                        throw new McpError(ErrorCode.InvalidParams, 'Invalid log_event arguments');
                    }
                    return await this.handleLogEvent({
                        level: level as LogEventArgs['level'],
                        message,
                        context: context as ErrorContext | undefined
                    });
                }
                case 'report_error': {
                    const { error, context } = args as Record<string, unknown>;
                    if (!error || typeof error !== 'object') {
                        throw new McpError(ErrorCode.InvalidParams, 'Invalid report_error arguments');
                    }
                    return await this.handleReportError({
                        error: error as Error,
                        context: context as ErrorContext | undefined
                    });
                }
                case 'get_system_metrics':
                    return await this.handleGetSystemMetrics();
                case 'configure_alert': {
                    const { rule } = args as Record<string, unknown>;
                    if (!rule || typeof rule !== 'object') {
                        throw new McpError(ErrorCode.InvalidParams, 'Invalid configure_alert arguments');
                    }
                    return await this.handleConfigureAlert({ rule: rule as Omit<AlertRule, 'id'> });
                }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }

    private async handleLogEvent(args: LogEventArgs) {
        const { level, message, context } = args;
        const logEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            level,
            message,
            context,
        };

        this.errorLogs.set(logEntry.id, logEntry);
        
        if (context?.taskId) {
            this.eventEmitter.emit('task-event', {
                taskId: context.taskId,
                sequenceId: context.sequenceId || '',
                type: level === 'error' ? 'error' : 'info',
                timestamp: new Date(),
                metadata: context,
            });
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(logEntry),
            }],
        };
    }

    private async handleReportError(args: ReportErrorArgs) {
        const { error, context } = args;
        const errorEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            level: 'error',
            message: error.message,
            context: {
                ...context,
                stack: error.stack,
            },
        };

        this.errorLogs.set(errorEntry.id, errorEntry);
        this.checkAlertRules(errorEntry);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(errorEntry),
            }],
        };
    }

    private async handleGetSystemMetrics() {
        const metrics: SystemMetrics = {
            cpu: {
                usage: os.loadavg()[0],
                temperature: 0,
            },
            memory: {
                total: os.totalmem(),
                used: os.totalmem() - os.freemem(),
                free: os.freemem(),
            },
            disk: {
                total: 0,
                used: 0,
                free: 0,
            },
            network: {
                bytesIn: 0,
                bytesOut: 0,
            },
        };

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(metrics),
            }],
        };
    }

    private async handleConfigureAlert(args: ConfigureAlertArgs) {
        const alertRule: AlertRule = {
            id: crypto.randomUUID(),
            ...args.rule,
        };

        this.alertRules.set(alertRule.id, alertRule);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(alertRule),
            }],
        };
    }

    private checkAlertRules(event: any): void {
        Array.from(this.alertRules.values()).forEach(rule => {
            try {
                const shouldAlert = this.evaluateRule(rule, event);
                if (shouldAlert) {
                    this.triggerAlert(rule, event);
                }
            } catch (error) {
                console.error(`Error evaluating rule ${rule.id}:`, error);
            }
        });
    }

    private evaluateRule(rule: AlertRule, event: any): boolean {
        return false;
    }

    private triggerAlert(rule: AlertRule, event: any): void {
        const alert = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            rule,
            message: `Alert triggered by ${event.type || 'event'}`,
            status: 'active' as const,
        };

        this.activeAlerts.set(alert.id, alert);
        this.eventEmitter.emit('alert', alert);
    }

    private handleError(error: Error): void {
        console.error('Server error:', error);
        void this.handleReportError({
            error,
            context: {
                component: 'central-monitoring',
                internal: true,
            },
        });
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('Central Monitoring Server running on stdio');
    }
}

const server = new CentralMonitoringServer();
void server.run().catch((error: Error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});