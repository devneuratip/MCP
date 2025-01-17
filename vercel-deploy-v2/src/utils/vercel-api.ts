import axios, { AxiosError } from 'axios';
import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { DeployArgs } from '../types.js';

interface DeployResult {
    url?: string;
    deploymentId?: string;
    error?: string;
}

export class VercelAPI {
    private token: string;
    private baseURL = 'https://api.vercel.com';

    constructor(token: string) {
        this.token = token;
    }

    private async getAllFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
                const subFiles = await this.getAllFiles(fullPath);
                files.push(...subFiles);
            } else {
                files.push(fullPath);
            }
        }

        return files;
    }

    private async createFormData(projectPath: string): Promise<{ [key: string]: any }> {
        const files = await this.getAllFiles(projectPath);
        const formData: { [key: string]: any } = {};

        for (const file of files) {
            const relativePath = relative(projectPath, file);
            const content = await readFile(file);
            formData[`files[${relativePath}]`] = content;
        }

        return formData;
    }

    async createDeployment(options: DeployArgs): Promise<DeployResult> {
        try {
            // Primeiro, crie o projeto se ele não existir
            const projectResponse = await axios.post(`${this.baseURL}/v9/projects`, {
                name: options.projectName,
                framework: options.framework,
            }, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
            });

            // Prepare os arquivos para upload
            const files = await this.createFormData(options.projectPath);

            // Faça o deploy
            const deployResponse = await axios.post(`${this.baseURL}/v13/deployments`, {
                name: options.projectName,
                target: 'production',
                projectId: projectResponse.data.id,
                files,
                env: options.environmentVariables,
            }, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });

            return {
                url: deployResponse.data.url,
                deploymentId: deployResponse.data.id,
            };
        } catch (error) {
            if (error instanceof AxiosError) {
                console.error('Deployment error:', error.response?.data);
                return {
                    error: error.response?.data?.message || error.message,
                };
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during deployment';
            return {
                error: errorMessage,
            };
        }
    }
}