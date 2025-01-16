#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import natural from 'natural';
import stringSimilarity from 'string-similarity';
import nlp from 'compromise';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import NodeCache from 'node-cache';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface Tool {
  name: string;
  description: string;
  keywords: string[];
  category: string;
  usage_examples: string[];
}

interface ToolSuggestion {
  tool: Tool;
  score: number;
  reason: string;
}

class ToolSuggesterServer {
  private server: Server;
  private cache: NodeCache;
  private tools: Tool[];
  private tfidf: natural.TfIdf;
  private nlpProcessor: any;
  private tokenizer: natural.WordTokenizer;

  constructor() {
    this.server = new Server(
      {
        name: 'tool-suggester',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.tools = [];
    this.tfidf = new natural.TfIdf();
    this.nlpProcessor = winkNLP(model);
    this.tokenizer = new natural.WordTokenizer();

    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private preprocessText(text: string): string[] {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    return tokens?.filter(token => token.length > 2) || [];
  }

  private calculateSimilarity(text1: string, text2: string): number {
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase());
  }

  private extractKeyPhrases(text: string): string[] {
    const doc = this.nlpProcessor.readDoc(text);
    return doc.phrases().out();
  }

  private findToolsByKeywords(keywords: string[]): Tool[] {
    return this.tools.filter(tool => {
      return keywords.some(keyword =>
        tool.keywords.some(toolKeyword =>
          this.calculateSimilarity(keyword, toolKeyword) > 0.7
        )
      );
    });
  }

  private rankTools(query: string, tools: Tool[]): ToolSuggestion[] {
    const suggestions: ToolSuggestion[] = [];
    const queryTokens = this.preprocessText(query);

    for (const tool of tools) {
      let score = 0;
      let reasons: string[] = [];

      // Similaridade com nome e descrição
      const nameSimilarity = this.calculateSimilarity(query, tool.name);
      const descSimilarity = this.calculateSimilarity(query, tool.description);
      score += nameSimilarity * 0.4 + descSimilarity * 0.3;

      if (nameSimilarity > 0.7) {
        reasons.push(`Nome da ferramenta muito similar à consulta`);
      }
      if (descSimilarity > 0.6) {
        reasons.push(`Descrição da ferramenta relacionada à consulta`);
      }

      // Análise de palavras-chave
      const keywordMatches = tool.keywords.filter(keyword =>
        queryTokens.some(token => this.calculateSimilarity(token, keyword) > 0.7)
      );
      score += keywordMatches.length * 0.2;

      if (keywordMatches.length > 0) {
        reasons.push(`Corresponde a ${keywordMatches.length} palavras-chave`);
      }

      // Análise de exemplos de uso
      const exampleMatches = tool.usage_examples.filter(example =>
        this.calculateSimilarity(query, example) > 0.5
      );
      score += exampleMatches.length * 0.1;

      if (exampleMatches.length > 0) {
        reasons.push(`Similar a ${exampleMatches.length} exemplos de uso`);
      }

      if (score > 0.3) {
        suggestions.push({
          tool,
          score,
          reason: reasons.join('; ')
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'suggest_tools',
          description: 'Sugere ferramentas com base em uma descrição de tarefa',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Descrição da tarefa ou necessidade'
              },
              limit: {
                type: 'number',
                description: 'Número máximo de sugestões'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'register_tool',
          description: 'Registra uma nova ferramenta no sistema',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome da ferramenta'
              },
              description: {
                type: 'string',
                description: 'Descrição da ferramenta'
              },
              keywords: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Palavras-chave relacionadas'
              },
              category: {
                type: 'string',
                description: 'Categoria da ferramenta'
              },
              usage_examples: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Exemplos de uso'
              }
            },
            required: ['name', 'description', 'keywords', 'category']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'suggest_tools': {
          const { query, limit = 5 } = request.params.arguments as {
            query: string;
            limit?: number;
          };

          try {
            const cacheKey = `suggestions:${query}`;
            const cached = this.cache.get<ToolSuggestion[]>(cacheKey);
            
            if (cached) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(cached.slice(0, limit), null, 2)
                  }
                ]
              };
            }

            const keywords = this.extractKeyPhrases(query);
            const relevantTools = this.findToolsByKeywords(keywords);
            const suggestions = this.rankTools(query, relevantTools);
            
            this.cache.set(cacheKey, suggestions);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(suggestions.slice(0, limit), null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao sugerir ferramentas: ${error}`
            );
          }
        }

        case 'register_tool': {
          const { name, description, keywords, category, usage_examples = [] } = 
            request.params.arguments as {
              name: string;
              description: string;
              keywords: string[];
              category: string;
              usage_examples?: string[];
            };

          try {
            const tool: Tool = {
              name,
              description,
              keywords,
              category,
              usage_examples
            };

            this.tools.push(tool);
            this.tfidf.addDocument(
              [tool.name, tool.description, ...tool.keywords, ...tool.usage_examples].join(' ')
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tool, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao registrar ferramenta: ${error}`
            );
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Ferramenta desconhecida: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Tool Suggester MCP server running on stdio');
  }
}

const server = new ToolSuggesterServer();
server.run().catch(logger.error);