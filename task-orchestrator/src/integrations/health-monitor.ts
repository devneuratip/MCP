import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { IServerConnection, IHealthCheck, HealthStatus } from '../types.js';
import {
  IHealthMonitorIntegration,
  IResourceMetrics,
  IHealthThresholds
} from './types.js';
import { BaseIntegration } from './base-integration.js';

interface SystemStatusResponse {
  status: string;
  cpu: number;
  memory: number;
  connections: number;
}

interface CpuInfoResponse {
  usage: number;
  cores: number;
}

interface MemoryUsageResponse {
  total: number;
  used: number;
  free: number;
  connections: number;
}

export class HealthMonitorIntegration extends BaseIntegration implements IHealthMonitorIntegration {
  constructor(server: Server) {
    super(server);
  }

  async checkServerHealth(server: IServerConnection): Promise<IHealthCheck> {
    try {
      const status = await this.makeRequest<SystemStatusResponse>({
        method: 'get_system_status',
        params: { serverId: server.id }
      });

      if (!status) {
        return this.createUnhealthyResponse();
      }

      return {
        status: this.mapHealthStatus(status.status),
        timestamp: new Date(),
        details: {
          cpu: status.cpu || 0,
          memory: status.memory || 0,
          activeConnections: status.connections || 0
        }
      };
    } catch (error) {
      console.error('Erro ao verificar saúde do servidor:', error);
      return this.createUnhealthyResponse();
    }
  }

  async monitorResources(): Promise<IResourceMetrics> {
    try {
      const [cpuInfo, memoryUsage] = await this.makeRequests<CpuInfoResponse | MemoryUsageResponse>([
        {
          method: 'get_cpu_info',
          params: {}
        },
        {
          method: 'get_memory_usage',
          params: {}
        }
      ]);

      if (!cpuInfo || !memoryUsage) {
        throw new Error('Falha ao obter informações de recursos');
      }

      return {
        cpu: (cpuInfo as CpuInfoResponse).usage,
        memory: (memoryUsage as MemoryUsageResponse).used,
        activeConnections: (memoryUsage as MemoryUsageResponse).connections,
        timestamp: new Date()
      };
    } catch (error) {
      return this.handleError(error, 'monitorResources');
    }
  }

  async configureAlerts(thresholds: IHealthThresholds): Promise<void> {
    try {
      const result = await this.makeRequest<void>({
        method: 'set_thresholds',
        params: { thresholds }
      });

      if (result === null) {
        throw new Error('Falha ao configurar alertas');
      }
    } catch (error) {
      this.handleError(error, 'configureAlerts');
    }
  }

  private mapHealthStatus(status: string): HealthStatus {
    switch (status.toLowerCase()) {
      case 'healthy':
        return HealthStatus.HEALTHY;
      case 'degraded':
        return HealthStatus.DEGRADED;
      default:
        return HealthStatus.UNHEALTHY;
    }
  }

  private createUnhealthyResponse(): IHealthCheck {
    return {
      status: HealthStatus.UNHEALTHY,
      timestamp: new Date(),
      details: {
        cpu: 0,
        memory: 0,
        activeConnections: 0
      }
    };
  }
}