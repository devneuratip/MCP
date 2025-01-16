export interface StrategyParameters {
  batchSize: number;
  timeout: number;
  retryAttempts: number;
  cacheEnabled: boolean;
}

export interface Strategy {
  id: string;
  domain: string;
  complexity: number;
  dependencies: string[];
  successRate: number;
  adaptationRate: number;
  parameters: StrategyParameters;
  lastUsed: string;
}