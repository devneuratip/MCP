export interface Pattern {
  id: string;
  input: string;
  context: string;
  outcome: 'success' | 'failure';
  errorType?: string;
  solution?: string;
  timestamp: string;
}