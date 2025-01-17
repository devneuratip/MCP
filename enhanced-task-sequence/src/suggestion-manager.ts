import { ThoughtData } from './types.js';

interface SuggestionContext {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
}

interface Suggestion {
  type: 'action' | 'tool' | 'approach';
  description: string;
  priority: number;
  confidence: number;
}

export class SuggestionManager {
  private aiModel: string;

  constructor(aiModel: string = 'o1') {
    this.aiModel = aiModel;
  }

  public generateSuggestions(context: SuggestionContext): Suggestion[] {
    if (this.aiModel !== 'o1') {
      return [];
    }

    const suggestions: Suggestion[] = [];
    const thoughtContent = context.thought.toLowerCase();

    // Analisa o conteúdo do pensamento para gerar sugestões contextuais
    if (thoughtContent.includes('validação') || thoughtContent.includes('verificar')) {
      suggestions.push({
        type: 'tool',
        description: 'Usar validation-checkpoints para validação automática',
        priority: 1,
        confidence: 0.9
      });
    }

    if (thoughtContent.includes('revisar') || thoughtContent.includes('qualidade')) {
      suggestions.push({
        type: 'tool',
        description: 'Utilizar solution-review para análise de código',
        priority: 1,
        confidence: 0.85
      });
    }

    if (thoughtContent.includes('coordenar') || thoughtContent.includes('gerenciar')) {
      suggestions.push({
        type: 'tool',
        description: 'Implementar task-orchestrator para coordenação',
        priority: 2,
        confidence: 0.8
      });
    }

    if (thoughtContent.includes('cache') || thoughtContent.includes('armazenar')) {
      suggestions.push({
        type: 'tool',
        description: 'Utilizar smart-cache para gerenciamento de dados',
        priority: 2,
        confidence: 0.75
      });
    }

    // Sugestões baseadas no número do pensamento
    if (context.thoughtNumber === 1) {
      suggestions.push({
        type: 'approach',
        description: 'Começar definindo a estrutura básica do sistema',
        priority: 1,
        confidence: 0.9
      });
    }

    if (context.thoughtNumber === context.totalThoughts) {
      suggestions.push({
        type: 'action',
        description: 'Revisar todos os pontos implementados',
        priority: 1,
        confidence: 0.95
      });
    }

    // Sugestões para revisões
    if (context.isRevision) {
      suggestions.push({
        type: 'tool',
        description: 'Usar error-handler para logging de mudanças',
        priority: 3,
        confidence: 0.7
      });
    }

    return suggestions;
  }
}