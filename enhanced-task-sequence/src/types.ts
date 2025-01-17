export interface TaskConfig {
  maxApiCost: number;
  autonomyLevel: 'full' | 'semi' | 'minimal';
  fallbackEnabled: boolean;
  retryAttempts: number;
}

export interface Task {
  id: string;
  description: string;
  completed: boolean;
  createdAt: string;
  apiCost: number;
  fallbackStrategies: string[];
  decisions: Array<{ decision: string; reason: string }>;
  index: number;
  totalTasks: number;
  remainingApiCost: number;
  thoughts?: ThoughtData[];
}

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
  suggestions?: Array<{
    type: 'action' | 'tool' | 'approach';
    description: string;
    priority: number;
    confidence: number;
  }>;
}

export interface TaskSequence {
  id: string;
  name: string;
  tasks: Task[];
  config: TaskConfig;
  currentTaskIndex: number;
  branches: Record<string, ThoughtData[]>;
}