import { Strategy, StrategyParameters } from '../types/strategy.js';
import { Context } from '../types/context.js';

interface StrategyStats {
  totalExecutions: number;
  successRate: number;
  averageAdaptationRate: number;
}

export class StrategyOptimizer {
  private strategies: Map<string, Strategy>;
  private readonly ADAPTATION_THRESHOLD = 0.7;

  constructor() {
    this.strategies = new Map();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async optimizeStrategy(context: Context): Promise<Strategy> {
    const existingStrategies = await this.findRelevantStrategies(context);
    
    if (existingStrategies.length > 0) {
      const bestStrategy = this.selectBestStrategy(existingStrategies);
      return this.createAdaptedStrategy(bestStrategy, context);
    }

    return this.createNewStrategy(context);
  }

  private async findRelevantStrategies(context: Context): Promise<Strategy[]> {
    return Array.from(this.strategies.values())
      .filter(s => this.isStrategyRelevant(s, context))
      .sort((a, b) => b.successRate - a.successRate);
  }

  private isStrategyRelevant(strategy: Strategy, context: Context): boolean {
    return (
      strategy.domain === context.domain &&
      strategy.complexity >= context.complexity * 0.8 &&
      strategy.complexity <= context.complexity * 1.2 &&
      this.hasCommonDependencies(strategy.dependencies, context.dependencies)
    );
  }

  private hasCommonDependencies(deps1: string[], deps2: string[]): boolean {
    return deps1.some(dep => deps2.includes(dep));
  }

  private selectBestStrategy(strategies: Strategy[]): Strategy {
    return strategies[0];
  }

  private createAdaptedStrategy(strategy: Strategy, context: Context): Strategy {
    const adaptedStrategy: Strategy = {
      id: this.generateId(),
      domain: context.domain,
      complexity: context.complexity,
      dependencies: [...new Set([...strategy.dependencies, ...context.dependencies])],
      successRate: strategy.successRate,
      adaptationRate: strategy.adaptationRate,
      parameters: { ...strategy.parameters },
      lastUsed: new Date().toISOString()
    };

    // Ajusta parâmetros baseado no contexto
    if (context.complexity > strategy.complexity) {
      adaptedStrategy.parameters.batchSize = Math.floor(strategy.parameters.batchSize * 0.8);
      adaptedStrategy.parameters.timeout = Math.floor(strategy.parameters.timeout * 1.2);
    } else {
      adaptedStrategy.parameters.batchSize = Math.floor(strategy.parameters.batchSize * 1.2);
      adaptedStrategy.parameters.timeout = Math.floor(strategy.parameters.timeout * 0.8);
    }

    this.strategies.set(adaptedStrategy.id, adaptedStrategy);
    return adaptedStrategy;
  }

  private createNewStrategy(context: Context): Strategy {
    const defaultParams: StrategyParameters = {
      batchSize: 32,
      timeout: 5000,
      retryAttempts: 3,
      cacheEnabled: true
    };

    const strategy: Strategy = {
      id: this.generateId(),
      domain: context.domain,
      complexity: context.complexity,
      dependencies: context.dependencies,
      successRate: 0.5,
      adaptationRate: 1.0,
      parameters: defaultParams,
      lastUsed: new Date().toISOString()
    };

    this.strategies.set(strategy.id, strategy);
    return strategy;
  }

  async adaptStrategy(strategy: Strategy, outcome: string): Promise<void> {
    const existingStrategy = this.strategies.get(strategy.id);
    if (!existingStrategy) return;

    const updatedStrategy = { ...existingStrategy };
    
    // Atualiza taxas de sucesso e adaptação
    const successFactor = outcome === 'success' ? 1 : 0;
    updatedStrategy.successRate = this.updateRate(
      existingStrategy.successRate,
      successFactor
    );

    updatedStrategy.adaptationRate = this.updateRate(
      existingStrategy.adaptationRate,
      this.calculateAdaptationSuccess(existingStrategy, outcome)
    );

    // Ajusta parâmetros baseado no resultado
    if (outcome === 'success') {
      updatedStrategy.parameters = {
        ...updatedStrategy.parameters,
        retryAttempts: Math.max(1, updatedStrategy.parameters.retryAttempts - 1)
      };
    } else {
      updatedStrategy.parameters = {
        ...updatedStrategy.parameters,
        timeout: Math.floor(updatedStrategy.parameters.timeout * 1.1),
        retryAttempts: updatedStrategy.parameters.retryAttempts + 1
      };
    }

    updatedStrategy.lastUsed = new Date().toISOString();
    this.strategies.set(strategy.id, updatedStrategy);
  }

  private updateRate(currentRate: number, factor: number): number {
    const learningRate = 0.1;
    return currentRate * (1 - learningRate) + factor * learningRate;
  }

  private calculateAdaptationSuccess(strategy: Strategy, outcome: string): number {
    if (outcome === 'success') {
      return strategy.adaptationRate >= this.ADAPTATION_THRESHOLD ? 1 : 0.8;
    }
    return 0.2;
  }

  async getStrategies(domain: string): Promise<Strategy[]> {
    return Array.from(this.strategies.values())
      .filter(s => s.domain === domain)
      .sort((a, b) => b.successRate - a.successRate);
  }

  async getStrategyStats(domain: string): Promise<StrategyStats> {
    const strategies = await this.getStrategies(domain);
    
    if (strategies.length === 0) {
      return {
        totalExecutions: 0,
        successRate: 0,
        averageAdaptationRate: 0
      };
    }

    return {
      totalExecutions: strategies.length,
      successRate: this.average(strategies.map(s => s.successRate)),
      averageAdaptationRate: this.average(strategies.map(s => s.adaptationRate))
    };
  }

  private average(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  async pruneStrategies(): Promise<number> {
    const lowPerformanceThreshold = 0.3;
    const sizeBefore = this.strategies.size;

    for (const [id, strategy] of this.strategies.entries()) {
      if (
        strategy.successRate < lowPerformanceThreshold &&
        strategy.adaptationRate < this.ADAPTATION_THRESHOLD
      ) {
        this.strategies.delete(id);
      }
    }

    return sizeBefore - this.strategies.size;
  }
}