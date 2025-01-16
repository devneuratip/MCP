import pkg from 'brain.js';
const { NeuralNetwork: BrainNeuralNetwork } = pkg;
import { Pattern } from '../types/pattern.js';

interface PatternPrediction {
  pattern: string;
  confidence: number;
}

type BrainNetwork = {
  train: (data: TrainingData[], options?: any) => void;
  run: (input: number[]) => { [key: string]: number };
  toJSON: () => any;
  fromJSON: (json: any) => void;
};

interface TrainingData {
  input: number[];
  output: { [key: string]: number };
}

export class PatternLearner {
  private network: BrainNetwork;
  private readonly INPUT_SIZE = 100;

  constructor() {
    this.network = new BrainNeuralNetwork({
      hiddenLayers: [64, 32],
      activation: 'sigmoid'
    });
  }

  async train(data: TrainingData[]): Promise<void> {
    if (data.length === 0) return;

    this.network.train(data, {
      iterations: 1000,
      errorThresh: 0.005,
      log: false,
      logPeriod: 100
    });
  }

  async predict(input: string): Promise<PatternPrediction[]> {
    const inputVector = this.vectorizeInput(input);
    const output = this.network.run(inputVector);

    // Converte previsões em array ordenado
    const predictions = Object.entries(output)
      .map(([pattern, confidence]) => ({
        pattern,
        confidence
      }))
      .filter(p => p.confidence >= 0.7)
      .sort((a, b) => b.confidence - a.confidence);

    return predictions;
  }

  private vectorizeInput(input: string): number[] {
    const vector = new Array(this.INPUT_SIZE).fill(0);
    const hash = this.hashString(input);
    
    for (let i = 0; i < Math.min(input.length, this.INPUT_SIZE); i++) {
      vector[i] = (hash[i] || 0) / 255; // Normalização
    }

    return vector;
  }

  private hashString(str: string): number[] {
    const hash = new Array(this.INPUT_SIZE).fill(0);
    for (let i = 0; i < str.length; i++) {
      hash[i % this.INPUT_SIZE] = (hash[i % this.INPUT_SIZE] + str.charCodeAt(i)) % 256;
    }
    return hash;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async learn(pattern: Pattern): Promise<void> {
    const inputVector = this.vectorizeInput(pattern.input);
    const outputData = { [pattern.outcome]: 1 };

    await this.train([{
      input: inputVector,
      output: outputData
    }]);
  }

  async getPatterns(domain: string): Promise<Pattern[]> {
    // Implementação simplificada - retorna um array vazio
    // Em uma implementação real, isso buscaria padrões de um armazenamento persistente
    return [];
  }
}