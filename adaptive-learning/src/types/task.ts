export interface Task {
  id: string;
  type: string;
  input: string;
  context: Record<string, any>;
  timestamp: string;
}

export interface TaskResult {
  id: string;
  status: 'success' | 'failure';
  data: any;
  metrics: {
    resourceUsage: number;
    accuracy: number;
    adaptationRate: number;
  };
  timestamp: string;
}