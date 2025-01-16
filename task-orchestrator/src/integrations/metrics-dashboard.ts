import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  IMetricsDashboardIntegration,
  IMetricData,
  IMetricFilter,
  IMetricReport,
  IMetricThresholds
} from './types.js';
import { BaseIntegration } from './base-integration.js';

interface MetricRecordResponse {
  success: boolean;
  metricId: string;
  timestamp: string;
}

interface MetricQueryResponse {
  metrics: Array<{
    id: string;
    serverId: string;
    type: string;
    value: unknown;
    timestamp: string;
    tags?: Record<string, string>;
  }>;
  summary: {
    count: number;
    min?: number;
    max?: number;
    average?: number;
  };
  period: {
    start: string;
    end: string;
  };
}

interface AlertConfigResponse {
  success: boolean;
  alerts: Array<{
    id: string;
    metricType: string;
    thresholds: {
      warning: number;
      critical: number;
    };
    period?: number;
  }>;
}

export class MetricsDashboardIntegration extends BaseIntegration implements IMetricsDashboardIntegration {
  constructor(server: Server) {
    super(server);
  }

  async recordMetric(metric: IMetricData): Promise<void> {
    try {
      const response = await this.makeRequest<MetricRecordResponse>({
        method: 'record_metric',
        params: {
          metric: {
            serverId: metric.serverId,
            type: metric.type,
            value: metric.value,
            timestamp: metric.timestamp?.toISOString() || new Date().toISOString(),
            tags: metric.tags || {}
          }
        }
      });

      if (!response || !response.success) {
        throw new Error('Falha ao registrar métrica');
      }
    } catch (error) {
      this.handleError(error, 'recordMetric');
    }
  }

  async getMetrics(filter: IMetricFilter): Promise<IMetricReport> {
    try {
      const response = await this.makeRequest<MetricQueryResponse>({
        method: 'get_metrics',
        params: {
          filter: {
            serverId: filter.serverId,
            type: filter.type,
            startTime: filter.startTime?.toISOString(),
            endTime: filter.endTime?.toISOString(),
            tags: filter.tags
          }
        }
      });

      if (!response) {
        throw new Error('Falha ao obter métricas');
      }

      return {
        metrics: response.metrics.map(m => ({
          serverId: m.serverId,
          type: m.type,
          value: m.value,
          timestamp: new Date(m.timestamp),
          tags: m.tags
        })),
        summary: response.summary,
        period: {
          start: new Date(response.period.start),
          end: new Date(response.period.end)
        }
      };
    } catch (error) {
      console.error('Erro ao obter métricas:', error);
      return {
        metrics: [],
        summary: {
          count: 0
        },
        period: {
          start: new Date(),
          end: new Date()
        }
      };
    }
  }

  async configureAlerts(thresholds: IMetricThresholds): Promise<void> {
    try {
      const response = await this.makeRequest<AlertConfigResponse>({
        method: 'configure_alerts',
        params: {
          thresholds: Object.entries(thresholds).map(([type, config]) => ({
            metricType: type,
            warning: config.warning,
            critical: config.critical,
            period: config.period
          }))
        }
      });

      if (!response || !response.success) {
        throw new Error('Falha ao configurar alertas');
      }
    } catch (error) {
      this.handleError(error, 'configureAlerts');
    }
  }

  async aggregateMetrics(
    serverId: string,
    type: string,
    period: 'hour' | 'day' | 'week' | 'month'
  ): Promise<IMetricReport> {
    try {
      const endTime = new Date();
      const startTime = this.calculateStartTime(endTime, period);

      return await this.getMetrics({
        serverId,
        type,
        startTime,
        endTime
      });
    } catch (error) {
      console.error('Erro ao agregar métricas:', error);
      return {
        metrics: [],
        summary: {
          count: 0
        },
        period: {
          start: new Date(),
          end: new Date()
        }
      };
    }
  }

  private calculateStartTime(endTime: Date, period: string): Date {
    const start = new Date(endTime);
    switch (period) {
      case 'hour':
        start.setHours(start.getHours() - 1);
        break;
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      default:
        throw new Error(`Período inválido: ${period}`);
    }
    return start;
  }
}