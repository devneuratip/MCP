import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ServerRegistry } from '../server-registry.js';
import { IServerConnection } from '../types.js';
import {
  IIntegrationManager,
  IErrorContext,
  IMetricFilter,
  IMetricReport,
  IHealthMonitorIntegration,
  IErrorHandlerIntegration,
  ISmartCacheIntegration,
  IRetrySystemIntegration,
  IMetricsDashboardIntegration
} from './types.js';
import { HealthMonitorIntegration } from './health-monitor.js';
import { ErrorHandlerIntegration } from './error-handler.js';
import { SmartCacheIntegration } from './smart-cache.js';
import { RetrySystemIntegration } from './retry-system.js';
import { MetricsDashboardIntegration } from './metrics-dashboard.js';

export class IntegrationManager implements IIntegrationManager {
  private healthMonitor?: IHealthMonitorIntegration;
  private errorHandler?: IErrorHandlerIntegration;
  private smartCache?: ISmartCacheIntegration;
  private retrySystem?: IRetrySystemIntegration;
  private metricsDashboard?: IMetricsDashboardIntegration;

  constructor(private serverRegistry: ServerRegistry) {}

  async initializeIntegrations(): Promise<void> {
    const servers = this.serverRegistry.getAllServers();
    
    for (const server of servers) {
      await this.initializeIntegration(server);
    }

    if (!this.healthMonitor) {
      console.warn('Health Monitor não inicializado');
    }
    if (!this.errorHandler) {
      console.warn('Error Handler não inicializado');
    }
    if (!this.smartCache) {
      console.warn('Smart Cache não inicializado');
    }
    if (!this.retrySystem) {
      console.warn('Retry System não inicializado');
    }
    if (!this.metricsDashboard) {
      console.warn('Metrics Dashboard não inicializado');
    }
  }

  async monitorServer(serverId: string): Promise<void> {
    const server = this.serverRegistry.getServer(serverId);
    if (!server) {
      throw new Error(`Servidor não encontrado: ${serverId}`);
    }

    try {
      // Verificar saúde do servidor
      if (this.healthMonitor) {
        const health = await this.healthMonitor.checkServerHealth(server);
        
        // Registrar métrica de saúde
        if (this.metricsDashboard) {
          await this.metricsDashboard.recordMetric({
            serverId,
            type: 'health_check',
            value: health.status,
            timestamp: health.timestamp,
            tags: {
              cpu: health.details.cpu.toString(),
              memory: health.details.memory.toString(),
              connections: health.details.activeConnections.toString()
            }
          });
        }

        // Cachear resultado
        if (this.smartCache) {
          await this.smartCache.cacheResponse(
            `health:${serverId}`,
            health,
            300 // TTL de 5 minutos
          );
        }
      }
    } catch (error) {
      await this.handleError(error as Error, {
        serverId,
        operation: 'monitorServer'
      });
    }
  }

  async handleError(error: Error, context: IErrorContext): Promise<void> {
    if (this.errorHandler) {
      try {
        await this.errorHandler.reportError(error, context);
        
        // Registrar métrica de erro
        if (this.metricsDashboard) {
          await this.metricsDashboard.recordMetric({
            serverId: context.serverId,
            type: 'error',
            value: 1,
            timestamp: new Date(),
            tags: {
              operation: context.operation,
              errorType: error.name
            }
          });
        }

        // Tentar recuperação
        await this.errorHandler.handleRecovery(error);
      } catch (handlerError) {
        console.error('Erro ao manipular erro:', handlerError);
      }
    } else {
      console.error('Error Handler não disponível:', error);
    }
  }

  async cacheServerData(serverId: string, data: unknown, ttl?: number): Promise<void> {
    if (this.smartCache) {
      try {
        await this.smartCache.cacheResponse(`server:${serverId}`, data, ttl);
      } catch (error) {
        await this.handleError(error as Error, {
          serverId,
          operation: 'cacheServerData'
        });
      }
    }
  }

  async getServerMetrics(serverId: string, filter?: IMetricFilter): Promise<IMetricReport> {
    if (this.metricsDashboard) {
      try {
        return await this.metricsDashboard.getMetrics({
          serverId,
          ...filter
        });
      } catch (error) {
        await this.handleError(error as Error, {
          serverId,
          operation: 'getServerMetrics'
        });
      }
    }

    return {
      metrics: [],
      summary: { count: 0 },
      period: {
        start: new Date(),
        end: new Date()
      }
    };
  }

  private async initializeIntegration(server: IServerConnection): Promise<void> {
    switch (server.name) {
      case 'health-monitor':
        this.healthMonitor = new HealthMonitorIntegration(server.server);
        break;
      case 'error-handler':
        this.errorHandler = new ErrorHandlerIntegration(server.server);
        break;
      case 'smart-cache':
        this.smartCache = new SmartCacheIntegration(server.server);
        break;
      case 'retry-system':
        this.retrySystem = new RetrySystemIntegration(server.server);
        break;
      case 'metrics-dashboard':
        this.metricsDashboard = new MetricsDashboardIntegration(server.server);
        break;
    }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    serverId: string,
    operationName: string
  ): Promise<T> {
    if (!this.retrySystem) {
      throw new Error('Retry System não disponível');
    }

    try {
      return await this.retrySystem.executeWithRetry(operation, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 2
      });
    } catch (error) {
      await this.handleError(error as Error, {
        serverId,
        operation: operationName
      });
      throw error;
    }
  }
}