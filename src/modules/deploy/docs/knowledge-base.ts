import * as fs from 'fs/promises';
import * as path from 'path';

export interface DocumentationEntry {
    path: string;
    content: string;
    category: 'guide' | 'template' | 'example' | 'core' | 'style';
    tags: string[];
}

export class KnowledgeBase {
    private static instance: KnowledgeBase;
    private docsBasePath: string;
    private cache: Map<string, DocumentationEntry>;

    private constructor() {
        this.docsBasePath = path.resolve(process.cwd(), '../../docs');
        this.cache = new Map();
    }

    static getInstance(): KnowledgeBase {
        if (!KnowledgeBase.instance) {
            KnowledgeBase.instance = new KnowledgeBase();
        }
        return KnowledgeBase.instance;
    }

    async getGuideContent(guideName: string): Promise<string | null> {
        const guidePath = path.join(this.docsBasePath, 'guides', `${guideName}.md`);
        try {
            return await fs.readFile(guidePath, 'utf-8');
        } catch {
            return null;
        }
    }

    async getTemplateInfo(templateType: string): Promise<DocumentationEntry[]> {
        const templatePath = path.join(this.docsBasePath, 'templates', templateType);
        try {
            const entries = await fs.readdir(templatePath, { withFileTypes: true });
            const templates: DocumentationEntry[] = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const readmePath = path.join(templatePath, entry.name, 'README.md');
                    try {
                        const content = await fs.readFile(readmePath, 'utf-8');
                        templates.push({
                            path: readmePath,
                            content,
                            category: 'template',
                            tags: [templateType, entry.name],
                        });
                    } catch {
                        // README não encontrado, continua
                    }
                }
            }

            return templates;
        } catch {
            return [];
        }
    }

    async searchDocs(query: string): Promise<DocumentationEntry[]> {
        const results: DocumentationEntry[] = [];
        const searchPaths = [
            { path: 'guides', category: 'guide' as const },
            { path: 'templates', category: 'template' as const },
            { path: 'vercel-examples', category: 'example' as const },
            { path: 'core', category: 'core' as const },
            { path: 'vercel-style-guide', category: 'style' as const },
        ];

        for (const { path: searchPath, category } of searchPaths) {
            const fullPath = path.join(this.docsBasePath, searchPath);
            try {
                const entries = await this.searchDirectory(fullPath, query, category);
                results.push(...entries);
            } catch {
                // Diretório não encontrado, continua
            }
        }

        return results;
    }

    private async searchDirectory(
        dirPath: string,
        query: string,
        category: DocumentationEntry['category'],
        depth = 0
    ): Promise<DocumentationEntry[]> {
        if (depth > 3) return []; // Limita profundidade da busca

        const results: DocumentationEntry[] = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    const subResults = await this.searchDirectory(fullPath, query, category, depth + 1);
                    results.push(...subResults);
                } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    if (content.toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            path: fullPath,
                            content,
                            category,
                            tags: this.extractTags(content),
                        });
                    }
                }
            }
        } catch {
            // Erro ao ler diretório ou arquivo, continua
        }

        return results;
    }

    private extractTags(content: string): string[] {
        const tags = new Set<string>();
        
        // Extrai tags de cabeçalhos markdown
        const headerMatches = content.match(/^#+\s+(.+)$/gm);
        if (headerMatches) {
            headerMatches.forEach(match => {
                const tag = match.replace(/^#+\s+/, '').toLowerCase();
                tags.add(tag);
            });
        }

        // Extrai tags de código
        const codeMatches = content.match(/```(\w+)/g);
        if (codeMatches) {
            codeMatches.forEach(match => {
                const lang = match.replace('```', '').toLowerCase();
                if (lang) tags.add(lang);
            });
        }

        return Array.from(tags);
    }

    async getBuildOptimizationGuide(): Promise<string | null> {
        return this.getGuideContent('advanced-build-optimization');
    }

    async getDeploymentGuide(): Promise<string | null> {
        return this.getGuideContent('build-deploy-success');
    }

    async getConfigReference(): Promise<string | null> {
        return this.getGuideContent('config-reference');
    }

    async getDebuggingTips(): Promise<string | null> {
        return this.getGuideContent('debugging-tips');
    }
}

// Exemplo de uso:
// const kb = KnowledgeBase.getInstance();
// const deployGuide = await kb.getDeploymentGuide();
// const nextTemplates = await kb.getTemplateInfo('next');
// const searchResults = await kb.searchDocs('deployment');