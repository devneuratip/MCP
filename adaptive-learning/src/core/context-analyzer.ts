import pkg from 'natural';
const { BayesClassifier } = pkg;
import { Context } from '../types/context.js';

interface ContextModel {
  id: string;
  domain: string;
  taskType: string;
  complexity: number;
  dependencies: string[];
  successPatterns: string[];
  failurePatterns: string[];
  timestamp: string;
}

export class ContextAnalyzer {
  private models: Map<string, ContextModel>;
  private classifier: any;

  constructor() {
    this.models = new Map();
    this.classifier = new BayesClassifier();
    this.initializeClassifier();
  }

  private initializeClassifier(): void {
    // Treinamento inicial do classificador
    this.classifier.addDocument('api integration database', 'backend');
    this.classifier.addDocument('user interface design', 'frontend');
    this.classifier.addDocument('machine learning model', 'ml');
    this.classifier.addDocument('security authentication', 'security');
    this.classifier.addDocument('performance optimization', 'optimization');
    this.classifier.train();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async analyzeContext(input: string): Promise<Context> {
    const classifications = this.classifier.getClassifications(input);
    const domain = classifications[0]?.label || 'unknown';
    const confidence = classifications[0]?.value || 0;

    const complexity = this.calculateComplexity(input);
    const dependencies = this.extractDependencies(input);

    const context: Context = {
      id: this.generateId(),
      domain,
      confidence,
      complexity,
      dependencies,
      timestamp: new Date().toISOString()
    };

    await this.storeContext(context);
    return context;
  }

  private calculateComplexity(input: string): number {
    // Implementação simplificada - baseada no comprimento e palavras-chave
    const complexityFactors = [
      'complex', 'difficult', 'advanced', 'multiple',
      'integration', 'optimization', 'security'
    ];

    const words = input.toLowerCase().split(' ');
    const complexityScore = words.reduce((score, word) => {
      return score + (complexityFactors.includes(word) ? 0.2 : 0);
    }, 0.5);

    return Math.min(Math.max(complexityScore, 0), 1);
  }

  private extractDependencies(input: string): string[] {
    // Implementação simplificada - procura por palavras-chave comuns
    const dependencies = new Set<string>();
    const keywords = {
      'database': ['database', 'sql', 'nosql', 'db'],
      'api': ['api', 'rest', 'graphql', 'endpoint'],
      'auth': ['authentication', 'authorization', 'auth', 'security'],
      'ui': ['interface', 'frontend', 'ui', 'ux'],
      'ml': ['machine learning', 'ml', 'ai', 'model']
    };

    const lowercaseInput = input.toLowerCase();
    
    Object.entries(keywords).forEach(([dep, terms]) => {
      if (terms.some(term => lowercaseInput.includes(term))) {
        dependencies.add(dep);
      }
    });

    return Array.from(dependencies);
  }

  private async storeContext(context: Context): Promise<void> {
    const model: ContextModel = {
      id: context.id,
      domain: context.domain,
      taskType: this.determineTaskType(context),
      complexity: context.complexity,
      dependencies: context.dependencies,
      successPatterns: [],
      failurePatterns: [],
      timestamp: context.timestamp
    };

    this.models.set(context.id, model);
  }

  private determineTaskType(context: Context): string {
    const domainToType: { [key: string]: string } = {
      'frontend': 'ui-development',
      'backend': 'api-development',
      'ml': 'model-training',
      'security': 'security-implementation',
      'optimization': 'performance-tuning'
    };

    return domainToType[context.domain] || 'general-development';
  }

  async updateModel(context: Context, outcome: string): Promise<void> {
    const model = this.models.get(context.id);
    if (!model) return;

    if (outcome === 'success') {
      model.successPatterns.push(context.domain);
    } else {
      model.failurePatterns.push(context.domain);
    }

    this.models.set(context.id, model);
  }

  async getContextModel(id: string): Promise<ContextModel | null> {
    return this.models.get(id) || null;
  }

  async getDomainStats(domain: string): Promise<{
    totalTasks: number;
    successRate: number;
    avgComplexity: number;
  }> {
    const models = Array.from(this.models.values())
      .filter(m => m.domain === domain);

    if (models.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        avgComplexity: 0
      };
    }

    const totalTasks = models.length;
    const successfulTasks = models.reduce(
      (count, m) => count + (m.successPatterns.length > 0 ? 1 : 0),
      0
    );
    const totalComplexity = models.reduce(
      (sum, m) => sum + m.complexity,
      0
    );

    return {
      totalTasks,
      successRate: successfulTasks / totalTasks,
      avgComplexity: totalComplexity / totalTasks
    };
  }
}