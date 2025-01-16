export interface Memory {
  id: string;
  pattern: string;
  frequency: number;
  importance: number;
  lastAccessed: string;
  connections?: string[];
}