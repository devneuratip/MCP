export interface DeployConfig {
    projectPath: string;
    projectName: string;
    framework?: string;
    teamId?: string;
    environmentVariables?: Record<string, string>;
}

export interface DeployResult {
    url?: string;
    deploymentId?: string;
    error?: string;
}

export interface IDeployProvider {
    deploy(config: DeployConfig): Promise<DeployResult>;
    validateProject(projectPath: string): Promise<{
        isValid: boolean;
        errors: string[];
    }>;
    generateConfig(projectPath: string, framework: string): Promise<{
        buildCommand: string;
        outputDirectory: string;
    }>;
}