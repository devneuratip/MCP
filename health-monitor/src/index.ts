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
import si from 'systeminformation';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class HealthMonitorServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'health-monitor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_system_status',
          description: 'Obtém o status geral do sistema',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get_memory_usage',
          description: 'Obtém informações sobre uso de memória',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get_cpu_info',
          description: 'Obtém informações sobre CPU',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'get_system_status': {
          try {
            const [cpu, mem, os] = await Promise.all([
              si.currentLoad(),
              si.mem(),
              si.osInfo()
            ]);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    cpuLoad: cpu.currentLoad,
                    memoryUsed: mem.used,
                    memoryTotal: mem.total,
                    osName: os.platform,
                    osVersion: os.release,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao obter status do sistema: ${error}`
            );
          }
        }

        case 'get_memory_usage': {
          try {
            const mem = await si.mem();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    total: mem.total,
                    free: mem.free,
                    used: mem.used,
                    active: mem.active,
                    available: mem.available,
                    swapTotal: mem.swaptotal,
                    swapUsed: mem.swapused,
                    swapFree: mem.swapfree
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao obter informações de memória: ${error}`
            );
          }
        }

        case 'get_cpu_info': {
          try {
            const [cpu, speed] = await Promise.all([
              si.cpu(),
              si.cpuCurrentSpeed()
            ]);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    manufacturer: cpu.manufacturer,
                    brand: cpu.brand,
                    cores: cpu.cores,
                    physicalCores: cpu.physicalCores,
                    speed: speed.avg,
                    maxSpeed: speed.max,
                    minSpeed: speed.min
                  }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao obter informações da CPU: ${error}`
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
    logger.info('Health Monitor MCP server running on stdio');
  }
}

const server = new HealthMonitorServer();
server.run().catch(logger.error);