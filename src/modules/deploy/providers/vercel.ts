import { IDeployProvider, DeployConfig, DeployResult } from './interface.js';
import { VercelAPI } from '../utils/vercel-api.js';
import { detectProjectStructure, validateProject } from '../utils/project-utils.js';

export class VercelProvider implements IDeployProvider {
    private api: VercelAPI;

    constructor() {
        const token = process.env.VERCEL_TOKEN;
        if (!token) {
            throw new Error('VERCEL_TOKEN environment variable is required');
        }
        this.api = new VercelAPI(token);
    }

    async deploy(config: DeployConfig): Promise<DeployResult> {
        const validation = await this.validateProject(config.projectPath);
        if (!validation.isValid) {
            return {
                error: `Project validation failed: ${validation.errors.join(', ')}`
            };
        }

        return await this.api.createDeployment({
            projectPath: config.projectPath,
            projectName: config.projectName,
            framework: config.framework,
            teamId: config.teamId,
            environmentVariables: config.environmentVariables
        });
    }

    async validateProject(projectPath: string): Promise<{ isValid: boolean; errors: string[] }> {
        return await validateProject(projectPath);
    }

    async generateConfig(projectPath: string, framework: string): Promise<{ buildCommand: string; outputDirectory: string }> {
        const structure = await detectProjectStructure(projectPath);
        let buildCommand = '';
        let outputDirectory = '';

        switch (framework.toLowerCase()) {
            case 'nextjs':
                buildCommand = 'next build';
                outputDirectory = '.next';
                break;
            case 'react':
            case 'create-react-app':
                buildCommand = 'react-scripts build';
                outputDirectory = 'build';
                break;
            case 'vue':
                buildCommand = 'vue-cli-service build';
                outputDirectory = 'dist';
                break;
            default:
                buildCommand = 'npm run build';
                outputDirectory = 'build';
        }

        if (structure.isMonorepo && structure.clientPath) {
            buildCommand = `cd ${structure.clientPath} && ${buildCommand}`;
        }

        return {
            buildCommand,
            outputDirectory
        };
    }
}