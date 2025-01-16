import { Memory } from '../types/memory.js';

interface MemoryStats {
  totalMemories: number;
  activeMemories: number;
  utilizationRate: number;
}

export class MemoryManager {
  private memories: Map<string, Memory>;
  private readonly MEMORY_THRESHOLD = 0.8;

  constructor() {
    this.memories = new Map();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async storeMemory(pattern: string, importance: number = 0.5): Promise<string> {
    const id = this.generateId();
    const memory: Memory = {
      id,
      pattern,
      frequency: 1,
      importance,
      lastAccessed: new Date().toISOString(),
      connections: []
    };

    this.memories.set(id, memory);
    await this.optimizeStorage();
    return id;
  }

  private async optimizeStorage(): Promise<void> {
    if (this.memories.size > 1000) {
      const sortedMemories = Array.from(this.memories.values())
        .sort((a, b) => {
          const scoreA = a.importance * a.frequency;
          const scoreB = b.importance * b.frequency;
          return scoreA - scoreB;
        });

      const toRemove = sortedMemories.slice(0, this.memories.size - 1000);
      toRemove.forEach(memory => this.memories.delete(memory.id));
    }
  }

  async retrieveRelevantMemories(domain: string): Promise<Memory[]> {
    const relevantMemories = Array.from(this.memories.values())
      .filter(memory => memory.pattern.includes(domain))
      .sort((a, b) => {
        const scoreA = a.importance * a.frequency;
        const scoreB = b.importance * b.frequency;
        return scoreB - scoreA;
      })
      .slice(0, 10);

    // Atualiza a frequência e último acesso
    relevantMemories.forEach(memory => {
      memory.frequency += 1;
      memory.lastAccessed = new Date().toISOString();
      this.memories.set(memory.id, memory);
    });

    return relevantMemories;
  }

  async consolidateMemory(): Promise<void> {
    const stats = await this.getStats();
    
    if (stats.utilizationRate > this.MEMORY_THRESHOLD) {
      await this.pruneMemories();
    }

    await this.mergeRelatedMemories();
    await this.updateImportance();
  }

  private async pruneMemories(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    Array.from(this.memories.values()).forEach(memory => {
      if (
        memory.importance < 0.3 &&
        (new Date(memory.lastAccessed) < thirtyDaysAgo || memory.frequency < 3)
      ) {
        this.memories.delete(memory.id);
      }
    });
  }

  private async mergeRelatedMemories(): Promise<void> {
    const memoriesList = Array.from(this.memories.values());

    for (let i = 0; i < memoriesList.length; i++) {
      for (let j = i + 1; j < memoriesList.length; j++) {
        if (this.areMemoriesRelated(memoriesList[i], memoriesList[j])) {
          await this.mergeMemories(memoriesList[i], memoriesList[j]);
        }
      }
    }
  }

  private areMemoriesRelated(memory1: Memory, memory2: Memory): boolean {
    const similarity = this.calculateSimilarity(memory1.pattern, memory2.pattern);
    return similarity > 0.8;
  }

  private calculateSimilarity(pattern1: string, pattern2: string): number {
    const maxLength = Math.max(pattern1.length, pattern2.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(pattern1, pattern2);
    return 1 - distance / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[str1.length][str2.length];
  }

  private async mergeMemories(memory1: Memory, memory2: Memory): Promise<void> {
    const mergedMemory: Memory = {
      ...memory1,
      frequency: memory1.frequency + memory2.frequency,
      importance: Math.max(memory1.importance, memory2.importance),
      lastAccessed: new Date().toISOString()
    };

    this.memories.set(memory1.id, mergedMemory);
    this.memories.delete(memory2.id);
  }

  private async updateImportance(): Promise<void> {
    this.memories.forEach(memory => {
      memory.importance = memory.importance * (1 + (memory.frequency / 100));
      this.memories.set(memory.id, memory);
    });
  }

  async getStats(): Promise<MemoryStats> {
    const memories = Array.from(this.memories.values());
    const activeMemories = memories.filter(m => m.importance > 0.5);
    const avgImportance = memories.reduce((sum, m) => sum + m.importance, 0) / memories.length || 0;

    return {
      totalMemories: memories.length,
      activeMemories: activeMemories.length,
      utilizationRate: avgImportance
    };
  }
}