export interface DeployArgs {
    projectPath: string;
    projectName: string;
    framework?: string;
    teamId?: string;
    environmentVariables?: Record<string, string>;
}

export interface VercelConfig {
    framework: string;
    buildCommand: string;
    outputDirectory: string;
}