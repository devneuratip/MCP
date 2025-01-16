import { Feedback } from '../types/feedback.js';

interface FeedbackStats {
  totalFeedback: number;
  successRate: number;
  averageExecutionTime: number;
  averageResourceUsage: number;
  averageAccuracy: number;
}

export class FeedbackProcessor {
  private feedback: Map<string, Feedback>;

  constructor() {
    this.feedback = new Map();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async processFeedback(feedback: Omit<Feedback, 'id' | 'timestamp'>): Promise<void> {
    const id = this.generateId();
    const timestamp = new Date().toISOString();

    const fullFeedback: Feedback = {
      id,
      ...feedback,
      timestamp
    };

    this.feedback.set(id, fullFeedback);
    await this.analyzeFeedback(fullFeedback);
  }

  private async analyzeFeedback(feedback: Feedback): Promise<void> {
    // Implementação simplificada - em uma versão real, isso poderia:
    // 1. Atualizar modelos de ML
    // 2. Ajustar parâmetros do sistema
    // 3. Gerar alertas para problemas recorrentes
    // 4. Atualizar métricas de performance
  }

  async getFeedbackStats(timeRange: string = '24h'): Promise<FeedbackStats> {
    const now = new Date();
    const timeRangeMs = this.parseTimeRange(timeRange);
    const cutoffTime = new Date(now.getTime() - timeRangeMs);

    const recentFeedback = Array.from(this.feedback.values())
      .filter(f => new Date(f.timestamp) >= cutoffTime);

    if (recentFeedback.length === 0) {
      return {
        totalFeedback: 0,
        successRate: 0,
        averageExecutionTime: 0,
        averageResourceUsage: 0,
        averageAccuracy: 0
      };
    }

    const successCount = recentFeedback.filter(f => f.result === 'success').length;
    const totalExecutionTime = recentFeedback.reduce(
      (sum, f) => sum + f.performance.executionTime,
      0
    );
    const totalResourceUsage = recentFeedback.reduce(
      (sum, f) => sum + f.performance.resourceUsage,
      0
    );
    const totalAccuracy = recentFeedback.reduce(
      (sum, f) => sum + f.performance.accuracy,
      0
    );

    return {
      totalFeedback: recentFeedback.length,
      successRate: successCount / recentFeedback.length,
      averageExecutionTime: totalExecutionTime / recentFeedback.length,
      averageResourceUsage: totalResourceUsage / recentFeedback.length,
      averageAccuracy: totalAccuracy / recentFeedback.length
    };
  }

  private parseTimeRange(timeRange: string): number {
    const units: { [key: string]: number } = {
      'h': 60 * 60 * 1000,        // hora em milissegundos
      'd': 24 * 60 * 60 * 1000,   // dia em milissegundos
      'w': 7 * 24 * 60 * 60 * 1000 // semana em milissegundos
    };

    const value = parseInt(timeRange);
    const unit = timeRange.slice(-1);

    if (isNaN(value) || !units[unit]) {
      return 24 * 60 * 60 * 1000; // default: 24 horas
    }

    return value * units[unit];
  }

  async getFeedbackByAction(action: string): Promise<Feedback[]> {
    return Array.from(this.feedback.values())
      .filter(f => f.action === action)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getRecentFeedback(limit: number = 10): Promise<Feedback[]> {
    return Array.from(this.feedback.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async clearOldFeedback(days: number = 30): Promise<number> {
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - days);

    let deletedCount = 0;
    for (const [id, feedback] of this.feedback.entries()) {
      if (new Date(feedback.timestamp) < cutoffTime) {
        this.feedback.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}