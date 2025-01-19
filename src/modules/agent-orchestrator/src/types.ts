export interface AgentConfig {
    id: string;
    name: string;
    type: AgentType;
    capabilities: string[];
    priority: number;
    contextTriggers: string[];
}

export type AgentType = 
    | 'backend'
    | 'code-reviewer'
    | 'designer'
    | 'frontend'
    | 'infrastructure'
    | 'lead'
    | 'learning'
    | 'rag-specialist';

export interface AgentRequest {
    context: string;
    task: string;
    metadata?: Record<string, any>;
    requiredCapabilities?: string[];
}

export interface AgentResponse {
    agentId: string;
    response: string;
    suggestions?: string[];
    nextSteps?: {
        tool?: string;
        server?: string;
        params?: Record<string, any>;
    }[];
}

export interface AgentContext {
    currentTask?: string;
    previousResponses?: AgentResponse[];
    activeServers?: string[];
    activeTools?: string[];
    metadata?: Record<string, any>;
}

export interface AgentRegistry {
    agents: Map<string, AgentConfig>;
    contextRules: Map<string, string[]>;
    capabilityMap: Map<string, string[]>;
}

export interface AgentMetrics {
    invocations: number;
    successRate: number;
    averageResponseTime: number;
    lastUsed: Date;
    commonTasks: string[];
}