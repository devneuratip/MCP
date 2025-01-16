export interface Message {
  type: 'system' | 'message';
  content: string;
  role: 'system' | 'user' | 'assistant';
}

export interface ApiKey {
  id: string;
  key: string;
  provider: string;
  model: string;
  usageCount: number;
  lastUsed: Date;
  rateLimitResets?: Date;
}

export interface ApiKeyPool {
  [provider: string]: {
    [model: string]: ApiKey[];
  };
}

export interface MessageCompression {
  maxTokens: number;
  summaryThreshold: number;
  compressionStrategy: 'truncate' | 'summarize' | 'hybrid';
}

export interface RouterConfig {
  rotationStrategy: 'round-robin' | 'least-used' | 'random';
  messageCompression: MessageCompression;
  fallbackEnabled: boolean;
  retryAttempts: number;
  improvePromptEnabled: boolean;
}

export interface CompressedMessage {
  original: Message[];
  compressed: Message[];
  summary?: string;
  tokenCount: number;
}

export interface ApiResponse {
  success: boolean;
  content?: string;
  error?: string;
  tokenCount?: number;
  provider?: string;
  model?: string;
}

export interface ApiRequest {
  messages: Message[];
  model: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  rateLimitHits: number;
}

export interface ProviderMetrics {
  [provider: string]: {
    [model: string]: ApiMetrics;
  };
}

export interface ImprovePromptConfig {
  enabled: boolean;
  model: string;
  provider: string;
  maxAttempts: number;
  criteria: {
    clarity: boolean;
    conciseness: boolean;
    context: boolean;
    grammar: boolean;
  };
}