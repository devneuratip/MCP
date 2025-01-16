import { IServerConnection, IHealthCheck } from '../types.js';

export interface IResourceMetrics {
  cpu: number;
  memory: number;
  activeConnections: number;
  timestamp: Date;
}

export interface IHealthThresholds {
  cpu: number;
  memory: number;
  maxConnections: number;
}

export interface IErrorContext {
  serverId: string;
  operation: string;
  timestamp?: Date;
  additionalInfo?: Record<string, unknown>;
}

export interface IErrorRecord {
  id: string;
  error: Error;
  context: IErrorContext;
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}

export interface IRetryConfig {
  maxAttempts: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  timeout?: number;
}

export interface IRetryStats {
  serverId: string;
  operation: string;
  attempts: number;
  successes: number;
  failures: number;
  lastAttempt: Date;
  averageDelay: number;
}

export interface IRetryPolicy {
  errorTypes: string[];
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  initialDelay: number;
  maxDelay: number;
}

export interface IMetricData {
  serverId: string;
  type: string;
  value: any;
  timestamp?: Date;
  tags?: Record<string, string>;
}

export interface IMetricFilter {
  serverId?: string;
  type?: string;
  startTime?: Date;
  endTime?: Date;
  tags?: Record<string, string>;
}

export interface IMetricReport {
  metrics: IMetricData[];
  summary: {
    count: number;
    min?: number;
    max?: number;
    average?: number;
  };
  period: {
    start: Date;
    end: Date;
  };
}

export interface IMetricThresholds {
  [metricType: string]: {
    warning: number;
    critical: number;
    period?: number;
  };
}

export interface IIntegrationConfig {
  enabled: boolean;
  serverId: string;
  options?: Record<string, unknown>;
}

export interface IIntegrationManager {
  initializeIntegrations(): Promise<void>;
  monitorServer(serverId: string): Promise<void>;
  handleError(error: Error, context: IErrorContext): Promise<void>;
  cacheServerData(serverId: string, data: unknown, ttl?: number): Promise<void>;
  getServerMetrics(serverId: string, filter?: IMetricFilter): Promise<IMetricReport>;
}

export interface IHealthMonitorIntegration {
  checkServerHealth(server: IServerConnection): Promise<IHealthCheck>;
  monitorResources(): Promise<IResourceMetrics>;
  configureAlerts(thresholds: IHealthThresholds): Promise<void>;
}

export interface IErrorHandlerIntegration {
  reportError(error: Error, context: IErrorContext): Promise<void>;
  getErrorHistory(serverId: string): Promise<IErrorRecord[]>;
  handleRecovery(error: Error): Promise<void>;
}

export interface ISmartCacheIntegration {
  cacheResponse(key: string, data: unknown, ttl?: number): Promise<void>;
  getCachedResponse<T>(key: string): Promise<T | null>;
  invalidateCache(pattern: string): Promise<void>;
}

export interface IRetrySystemIntegration {
  executeWithRetry<T>(operation: () => Promise<T>, config: IRetryConfig): Promise<T>;
  getRetryStats(serverId: string): Promise<IRetryStats>;
  configureRetryPolicy(policy: IRetryPolicy): Promise<void>;
}

export interface IMetricsDashboardIntegration {
  recordMetric(metric: IMetricData): Promise<void>;
  getMetrics(filter: IMetricFilter): Promise<IMetricReport>;
  configureAlerts(thresholds: IMetricThresholds): Promise<void>;
}