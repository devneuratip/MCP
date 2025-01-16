import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  IRetrySystemIntegration,
  IRetryConfig,
  IRetryStats,
  IRetryPolicy
} from './types.js';
import { BaseIntegration } from './base-integration.js';

interface RetryResponse<T> {
  success: boolean;
  result: T | null;
  attempts: number;
  error?: string;
  lastAttempt: string;
}

interface RetryStatsResponse {
  serverId: string;
  operation: string;
  attempts: {
    total: number;
    successful: number;
    failed: number;
  };
  timing: {
    lastAttempt: string;
    averageDelay: number;
    totalTime: number;
  };
}

interface RetryPolicyResponse {
  success: boolean;
  policy: {
    id: string;
    errorTypes: string[];
    maxAttempts: number;
    backoffStrategy: string;
    initialDelay: number;
    maxDelay: number;
  };
}

export class RetrySystemIntegration extends BaseIntegration implements IRetrySystemIntegration {
  constructor(server: Server) {
    super(server);
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: IRetryConfig
  ): Promise<T> {
    try {
      const operationId = this.generateOperationId();
      const serializedOperation = this.serializeOperation(operation);

      const response = await this.makeRequest<RetryResponse<T>>({
        method: 'execute_with_retry',
        params: {
          operationId,
          operation: serializedOperation,
          config: {
            maxAttempts: config.maxAttempts,
            initialDelay: config.initialDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            backoffFactor: config.backoffFactor || 2,
            timeout: config.timeout || 5000
          }
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Falha na execução com retry');
      }

      if (response.result === null) {
        throw new Error('Operação retornou resultado nulo');
      }

      return response.result;
    } catch (error) {
      return this.handleError(error, 'executeWithRetry');
    }
  }

  async getRetryStats(serverId: string): Promise<IRetryStats> {
    try {
      const response = await this.makeRequest<RetryStatsResponse>({
        method: 'get_retry_stats',
        params: { serverId }
      });

      if (!response) {
        throw new Error('Falha ao obter estatísticas de retry');
      }

      return {
        serverId: response.serverId,
        operation: response.operation,
        attempts: response.attempts.total,
        successes: response.attempts.successful,
        failures: response.attempts.failed,
        lastAttempt: new Date(response.timing.lastAttempt),
        averageDelay: response.timing.averageDelay
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return {
        serverId,
        operation: 'unknown',
        attempts: 0,
        successes: 0,
        failures: 0,
        lastAttempt: new Date(),
        averageDelay: 0
      };
    }
  }

  async configureRetryPolicy(policy: IRetryPolicy): Promise<void> {
    try {
      const response = await this.makeRequest<RetryPolicyResponse>({
        method: 'configure_retry_policy',
        params: {
          policy: {
            errorTypes: policy.errorTypes,
            maxAttempts: policy.maxAttempts,
            backoffStrategy: policy.backoffStrategy,
            initialDelay: policy.initialDelay,
            maxDelay: policy.maxDelay
          }
        }
      });

      if (!response || !response.success) {
        throw new Error('Falha ao configurar política de retry');
      }
    } catch (error) {
      this.handleError(error, 'configureRetryPolicy');
    }
  }

  private generateOperationId(): string {
    return `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private serializeOperation(operation: () => Promise<any>): string {
    // Convertendo a função em string para envio
    const fnString = operation.toString();
    
    // Removendo referências a variáveis externas que podem causar problemas
    const cleanFnString = fnString.replace(/[\r\n\t]/g, ' ')
                                 .replace(/\s+/g, ' ')
                                 .trim();

    return cleanFnString;
  }

  private async validatePolicy(policy: IRetryPolicy): Promise<boolean> {
    if (policy.maxAttempts < 1) {
      throw new Error('maxAttempts deve ser maior que 0');
    }

    if (policy.initialDelay < 0) {
      throw new Error('initialDelay não pode ser negativo');
    }

    if (policy.maxDelay < policy.initialDelay) {
      throw new Error('maxDelay deve ser maior que initialDelay');
    }

    const validStrategies = ['linear', 'exponential', 'fixed'];
    if (!validStrategies.includes(policy.backoffStrategy)) {
      throw new Error(`backoffStrategy deve ser um dos seguintes: ${validStrategies.join(', ')}`);
    }

    return true;
  }
}