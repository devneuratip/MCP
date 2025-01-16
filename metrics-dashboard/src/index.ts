#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import NodeCache from 'node-cache';
import * as promClient from 'prom-client';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class MetricsDashboardServer {
  private server: Server;
  private app: express.Application = express();
  private httpServer: ReturnType<typeof createServer> = createServer(this.app);
  private io: SocketServer = new SocketServer(this.httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  private cache: NodeCache = new NodeCache({ stdTTL: 300 });
  private registry: promClient.Registry = new promClient.Registry();

  constructor() {
    this.server = new Server(
      {
        name: 'metrics-dashboard',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupMetrics();
    this.setupExpress();
    this.setupWebsocket();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      this.httpServer.close();
      process.exit(0);
    });
  }

  private setupMetrics() {
    promClient.collectDefaultMetrics({ register: this.registry });
  }

  private setupExpress() {
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', this.registry.contentType);
        res.end(await this.registry.metrics());
      } catch (error) {
        res.status(500).end(error);
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    const port = process.env.PORT || 3000;
    this.httpServer.listen(port, () => {
      logger.info(`Dashboard server running on port ${port}`);
    });
  }

  private setupWebsocket() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected to dashboard');
      socket.on('disconnect', () => {
        logger.info('Client disconnected from dashboard');
      });
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'record_metric',
          description: 'Registra uma nova métrica',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome da métrica'
              },
              value: {
                type: 'number',
                description: 'Valor da métrica'
              },
              labels: {
                type: 'object',
                description: 'Labels adicionais',
                additionalProperties: true
              }
            },
            required: ['name', 'value']
          }
        },
        {
          name: 'get_metrics',
          description: 'Obtém métricas registradas',
          inputSchema: {
            type: 'object',
            properties: {
              names: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Nomes das métricas para buscar'
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'record_metric': {
          const { name, value, labels = {} } = request.params.arguments as {
            name: string;
            value: number;
            labels?: Record<string, string>;
          };

          try {
            let metric = this.registry.getSingleMetric(name);
            if (!metric) {
              metric = new promClient.Gauge({
                name,
                help: `Metric ${name}`,
                labelNames: Object.keys(labels),
                registers: [this.registry]
              });
            }

            (metric as promClient.Gauge).set(labels, value);
            this.io.emit('metric_update', { name, value, labels });

            return {
              content: [
                {
                  type: 'text',
                  text: `Métrica ${name} registrada com sucesso`
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao registrar métrica: ${error}`
            );
          }
        }

        case 'get_metrics': {
          const { names = [] } = request.params.arguments as {
            names?: string[];
          };

          try {
            const metrics = await this.registry.getMetricsAsJSON();
            const filteredMetrics = names.length > 0
              ? metrics.filter(m => names.includes(m.name))
              : metrics;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(filteredMetrics, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao buscar métricas: ${error}`
            );
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Ferramenta desconhecida: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Metrics Dashboard MCP server running on stdio');
  }
}

const server = new MetricsDashboardServer();
server.run().catch(logger.error);