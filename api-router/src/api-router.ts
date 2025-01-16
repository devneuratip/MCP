import winston from 'winston';
import {
  ApiKey,
  ApiKeyPool,
  RouterConfig,
  Message,
  ApiRequest,
  ApiResponse,
  CompressedMessage,
  ApiMetrics,
  ProviderMetrics,
} from './types.js';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'api-router-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'api-router.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class ApiRouter {
  private apiKeys: ApiKeyPool = {};
  private metrics: ProviderMetrics = {};
  private currentIndex: { [provider: string]: { [model: string]: number } } = {};

  constructor(private config: RouterConfig) {
    logger.info('ApiRouter initialized with config:', config);
  }

  addApiKey(apiKey: ApiKey): void {
    if (!this.apiKeys[apiKey.provider]) {
      this.apiKeys[apiKey.provider] = {};
    }
    if (!this.apiKeys[apiKey.provider][apiKey.model]) {
      this.apiKeys[apiKey.provider][apiKey.model] = [];
    }
    this.apiKeys[apiKey.provider][apiKey.model].push(apiKey);
    logger.info(`API key added: ${apiKey.id} for ${apiKey.provider}/${apiKey.model}`);
  }

  private getNextApiKey(provider: string, model: string): ApiKey | null {
    const keys = this.apiKeys[provider]?.[model];
    if (!keys || keys.length === 0) {
      return null;
    }

    if (!this.currentIndex[provider]) {
      this.currentIndex[provider] = {};
    }
    if (typeof this.currentIndex[provider][model] === 'undefined') {
      this.currentIndex[provider][model] = 0;
    }

    let selectedKey: ApiKey | null = null;

    switch (this.config.rotationStrategy) {
      case 'round-robin':
        selectedKey = keys[this.currentIndex[provider][model]];
        this.currentIndex[provider][model] = (this.currentIndex[provider][model] + 1) % keys.length;
        break;
      
      case 'least-used':
        selectedKey = keys.reduce((min, current) => 
          !min || current.usageCount < min.usageCount ? current : min
        );
        break;
      
      case 'random':
        selectedKey = keys[Math.floor(Math.random() * keys.length)];
        break;
    }

    if (selectedKey) {
      selectedKey.usageCount++;
      selectedKey.lastUsed = new Date();
    }

    return selectedKey;
  }

  private async compressMessages(messages: Message[]): Promise<CompressedMessage> {
    const estimatedTokens = messages.reduce((sum, msg) => sum + msg.content.length / 4, 0);
    
    if (estimatedTokens <= this.config.messageCompression.maxTokens) {
      return {
        original: messages,
        compressed: messages,
        tokenCount: estimatedTokens
      };
    }

    let compressed: Message[] = [];
    let summary: string | undefined;

    switch (this.config.messageCompression.compressionStrategy) {
      case 'truncate':
        compressed = messages.slice(-Math.floor(this.config.messageCompression.maxTokens / 100));
        break;

      case 'summarize':
        const systemMessage = messages.find(m => m.role === 'system');
        const recentMessages = messages.slice(-3);
        const oldMessages = messages.slice(1, -3);
        
        if (oldMessages.length > 0) {
          summary = `Resumo do contexto anterior: ${oldMessages.map(m => m.content).join(' ')}`;
          compressed = [
            ...(systemMessage ? [systemMessage] : []),
            { role: 'system', type: 'system', content: summary },
            ...recentMessages
          ];
        } else {
          compressed = messages;
        }
        break;

      case 'hybrid':
        if (estimatedTokens > this.config.messageCompression.summaryThreshold) {
          const systemMessage = messages.find(m => m.role === 'system');
          const recentMessages = messages.slice(-3);
          const oldMessages = messages.slice(1, -3);
          
          if (oldMessages.length > 0) {
            summary = `Resumo do contexto anterior: ${oldMessages.map(m => m.content).join(' ')}`;
            compressed = [
              ...(systemMessage ? [systemMessage] : []),
              { role: 'system', type: 'system', content: summary },
              ...recentMessages
            ];
          }
        } else {
          compressed = messages.slice(-Math.floor(this.config.messageCompression.maxTokens / 100));
        }
        break;
    }

    return {
      original: messages,
      compressed: compressed || messages,
      summary,
      tokenCount: (compressed || messages).reduce((sum, msg) => sum + msg.content.length / 4, 0)
    };
  }

  private updateMetrics(provider: string, model: string, response: ApiResponse): void {
    if (!this.metrics[provider]) {
      this.metrics[provider] = {};
    }
    if (!this.metrics[provider][model]) {
      this.metrics[provider][model] = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokensUsed: 0,
        averageResponseTime: 0,
        rateLimitHits: 0
      };
    }

    const metrics = this.metrics[provider][model];
    metrics.totalRequests++;
    
    if (response.success) {
      metrics.successfulRequests++;
      if (response.tokenCount) {
        metrics.totalTokensUsed += response.tokenCount;
      }
    } else {
      metrics.failedRequests++;
      if (response.error?.includes('rate limit')) {
        metrics.rateLimitHits++;
      }
    }
  }

  async processRequest(request: ApiRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing request:', request);
      const compressedMessages = await this.compressMessages(request.messages);
      let attempts = 0;
      let lastError: string | undefined;

      while (attempts < (this.config.retryAttempts + 1)) {
        const apiKey = this.getNextApiKey(request.provider, request.model);
        
        if (!apiKey) {
          throw new Error(`No API key available for ${request.provider}/${request.model}`);
        }

        try {
          logger.info(`Using API key ${apiKey.id} for request`);
          const response: ApiResponse = {
            success: true,
            content: "Resposta simulada",
            tokenCount: compressedMessages.tokenCount,
            provider: request.provider,
            model: request.model
          };

          this.updateMetrics(request.provider, request.model, response);
          return response;

        } catch (error: any) {
          lastError = error.message;
          logger.error('Request failed:', error);
          
          if (error.message.includes('rate limit') && this.config.fallbackEnabled) {
            attempts++;
            apiKey.rateLimitResets = new Date(Date.now() + 60000);
            continue;
          }
          
          throw error;
        }
      }

      throw new Error(`Max retry attempts reached. Last error: ${lastError}`);

    } catch (error: any) {
      const errorResponse: ApiResponse = {
        success: false,
        error: error.message,
        provider: request.provider,
        model: request.model
      };
      
      this.updateMetrics(request.provider, request.model, errorResponse);
      return errorResponse;
    }
  }

  getMetrics(): ProviderMetrics {
    return this.metrics;
  }

  getApiKeyPool(): ApiKeyPool {
    return this.apiKeys;
  }
}
