export interface ErrorContext {
    component?: string;
    file?: string;
    line?: number;
    stack?: string;
    metadata?: Record<string, any>;
    taskId?: string;
    sequenceId?: string;
    internal?: boolean;
}

export interface ErrorLog {
    id: string;
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    context?: ErrorContext;
}

export interface ErrorFilters {
    startDate?: Date;
    endDate?: Date;
    level?: string;
    component?: string;
}

export interface SystemMetrics {
    cpu: {
        usage: number;
        temperature: number;
    };
    memory: {
        total: number;
        used: number;
        free: number;
    };
    disk: {
        total: number;
        used: number;
        free: number;
    };
    network: {
        bytesIn: number;
        bytesOut: number;
    };
}

export interface AlertRule {
    id: string;
    condition: string;
    threshold: number;
    action: 'notify' | 'rollback' | 'restart';
    target?: string;
}

export interface Alert {
    id: string;
    timestamp: Date;
    rule: AlertRule;
    message: string;
    status: 'active' | 'resolved';
}

export interface EnhancedTaskEvent {
    taskId: string;
    sequenceId: string;
    type: 'start' | 'complete' | 'error';
    timestamp: Date;
    metadata?: Record<string, any>;
}