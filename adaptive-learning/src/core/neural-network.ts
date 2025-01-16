import pkg from 'brain.js';
const { NeuralNetwork: BrainNeuralNetwork } = pkg;

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

export class NeuralNetwork {
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

  async predict(input: number[]): Promise<{ [key: string]: number }> {
    if (input.length !== this.INPUT_SIZE) {
      throw new Error(`Input size must be ${this.INPUT_SIZE}`);
    }

    const normalizedInput = this.normalizeInput(input);
    const output = this.network.run(normalizedInput);
    return this.denormalizeOutput(output);
  }

  async save(path: string): Promise<void> {
    const modelState = this.network.toJSON();
    // O salvamento real seria implementado aqui
    // Por exemplo, usando fs.writeFileSync para salvar modelState
  }

  async load(path: string): Promise<void> {
    // O carregamento real seria implementado aqui
    // Por exemplo, usando fs.readFileSync para carregar modelState
    // this.network.fromJSON(modelState);
  }

  private normalizeInput(input: number[]): number[] {
    const sum = input.reduce((a, b) => a + b, 0);
    return sum > 0 ? input.map(v => v / sum) : input;
  }

  private denormalizeOutput(output: { [key: string]: number }): { [key: string]: number } {
    const total = Object.values(output).reduce((a, b) => a + b, 0);
    const result: { [key: string]: number } = {};
    
    for (const [key, value] of Object.entries(output)) {
      result[key] = total > 0 ? value / total : value;
    }
    
    return result;
  }
}