export interface Performance {
  executionTime: number;
  resourceUsage: number;
  accuracy: number;
}

export interface Feedback {
  id: string;
  action: string;
  result: 'success' | 'failure';
  performance: Performance;
  timestamp: string;
}

export interface Metrics {
  responseTime: number;
  accuracy: number;
  resourceUsage: number;
  adaptationRate: number;
}