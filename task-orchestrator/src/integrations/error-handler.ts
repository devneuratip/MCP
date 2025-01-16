import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  IErrorHandlerIntegration,
  IErrorContext,
  IErrorRecord
} from './types.js';
import { BaseIntegration } from './base-integration.js';

interface ErrorReportResponse {
  id: string;
  timestamp: string;
  status: 'recorded' | 'failed';
}

interface ErrorHistoryResponse {
  errors: Array<{
    id: string;
    message: string;
    stack?: string;
    context: {
      serverId: string;
      operation: string;
      timestamp?: string;
      additionalInfo?: Record<string, unknown>;
    };
    timestamp: string;
    resolved: boolean;
    resolution?: string;
  }>;
  total: number;
}

interface ErrorRecoveryResponse {
  success: boolean;
  strategy: string;
  details?: string;
}

export class ErrorHandlerIntegration extends BaseIntegration implements IErrorHandlerIntegration {
  constructor(server: Server) {
    super(server);
  }

  async reportError(error: Error, context: IErrorContext): Promise<void> {
    try {
      const response = await this.makeRequest<ErrorReportResponse>({
        method: 'report_error',
        params: {
          message: error.message,
          stack: error.stack,
          context: this.formatErrorContext(context)
        }
      });

      if (!response || response.status === 'failed') {
        throw new Error('Falha ao reportar erro');
      }
    } catch (error) {
      this.handleError(error, 'reportError');
    }
  }

  async getErrorHistory(serverId: string): Promise<IErrorRecord[]> {
    try {
      const response = await this.makeRequest<ErrorHistoryResponse>({
        method: 'get_error_history',
        params: { serverId }
      });

      if (!response) {
        return [];
      }

      return response.errors.map(error => this.parseErrorResponse(error));
    } catch (error) {
      console.error('Erro ao obter histórico:', error);
      return [];
    }
  }

  async handleRecovery(error: Error): Promise<void> {
    try {
      const response = await this.makeRequest<ErrorRecoveryResponse>({
        method: 'handle_recovery',
        params: {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name
          }
        }
      });

      if (!response || !response.success) {
        throw new Error(`Falha na recuperação: ${response?.details || 'Motivo desconhecido'}`);
      }
    } catch (error) {
      this.handleError(error, 'handleRecovery');
    }
  }

  private formatErrorContext(context: IErrorContext): Record<string, unknown> {
    return {
      serverId: context.serverId,
      operation: context.operation,
      timestamp: context.timestamp?.toISOString() || new Date().toISOString(),
      additionalInfo: context.additionalInfo || {}
    };
  }

  private parseErrorResponse(response: ErrorHistoryResponse['errors'][0]): IErrorRecord {
    const error = new Error(response.message);
    if (response.stack) {
      error.stack = response.stack;
    }

    const context: IErrorContext = {
      serverId: response.context.serverId,
      operation: response.context.operation,
      timestamp: response.context.timestamp ? new Date(response.context.timestamp) : undefined,
      additionalInfo: response.context.additionalInfo
    };

    return {
      id: response.id,
      error,
      context,
      timestamp: new Date(response.timestamp),
      resolved: response.resolved,
      resolution: response.resolution
    };
  }
}