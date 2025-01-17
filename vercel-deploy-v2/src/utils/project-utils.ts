import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface ProjectStructure {
    isMonorepo: boolean;
    clientPath?: string;
    serverPath?: string;
    hasPackageJson: boolean;
    hasConfigFiles: boolean;
}

export interface ProjectValidation {
    isValid: boolean;
    errors: string[];
}

export function detectProjectStructure(projectPath: string): ProjectStructure {
    const structure: ProjectStructure = {
        isMonorepo: false,
        hasPackageJson: existsSync(join(projectPath, 'package.json')),
        hasConfigFiles: existsSync(join(projectPath, 'vercel.json')) || 
                       existsSync(join(projectPath, 'next.config.js')) ||
                       existsSync(join(projectPath, 'vite.config.js'))
    };

    // Verifica se é um monorepo
    const packagesDir = join(projectPath, 'packages');
    if (existsSync(packagesDir) && statSync(packagesDir).isDirectory()) {
        structure.isMonorepo = true;
        const packages = readdirSync(packagesDir);
        if (packages.includes('client')) {
            structure.clientPath = join(packagesDir, 'client');
        }
        if (packages.includes('server')) {
            structure.serverPath = join(packagesDir, 'server');
        }
    }

    return structure;
}

export function validateProject(projectPath: string): ProjectValidation {
    const errors: string[] = [];
    const structure = detectProjectStructure(projectPath);

    if (!structure.hasPackageJson) {
        errors.push('Project must have a package.json file');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}