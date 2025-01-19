export interface CodeContext {
    filePath?: string;
    language?: string;
    framework?: string;
    dependencies?: Record<string, string>;
    projectType?: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
}

export interface ReviewResult {
    score: number;
    issues: Array<{
        type: 'error' | 'warning' | 'suggestion';
        message: string;
        line?: number;
        file?: string;
        severity: 'high' | 'medium' | 'low';
        category: 'security' | 'performance' | 'maintainability' | 'functionality' | 'style';
    }>;
    recommendations: string[];
}

export interface TestConfig {
    testPattern?: string[];
    coverage?: boolean;
    timeout?: number;
    environment?: Record<string, string>;
}

export interface TestResult {
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    coverage?: {
        statements: number;
        branches: number;
        functions: number;
        lines: number;
    };
    failures: Array<{
        testName: string;
        message: string;
        stack?: string;
    }>;
}

export interface Checkpoint {
    id: string;
    name: string;
    rules: Array<{
        type: 'syntax' | 'dependency' | 'security' | 'performance' | 'custom';
        condition: string;
        errorMessage: string;
    }>;
}

export interface CheckpointResult {
    passed: boolean;
    failedRules: Array<{
        rule: string;
        message: string;
    }>;
}

export interface MistakeReport {
    commonMistakes: Array<{
        type: 'build' | 'deploy' | 'runtime' | 'security';
        description: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        fix?: string;
    }>;
    buildIssues: Array<{
        message: string;
        file?: string;
        line?: number;
        solution?: string;
    }>;
    deploymentRisks: Array<{
        risk: string;
        mitigation: string;
    }>;
}

export interface Suggestion {
    type: 'refactor' | 'optimization' | 'security' | 'feature';
    description: string;
    priority: 'high' | 'medium' | 'low';
    effort: 'small' | 'medium' | 'large';
    impact: 'high' | 'medium' | 'low';
    code?: {
        before: string;
        after: string;
    };
}