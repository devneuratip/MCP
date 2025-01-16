export interface Context {
  id: string;
  domain: string;
  confidence: number;
  complexity: number;
  dependencies: string[];
  timestamp: string;
}