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
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import NodeCache from 'node-cache';

const execAsync = promisify(exec);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface TestResult {
  passed: boolean;
  suites: number;
  tests: number;
  passed_tests: number;
  failed_tests: number;
  skipped_tests: number;
  duration: number;
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  error?: string;
}

interface TestConfig {
  framework: 'jest' | 'mocha';
  testMatch?: string[];
  coverage?: boolean;
  timeout?: number;
}

class TestValidatorServer {
  private server: Server;
  private cache: NodeCache;
  private results: Map<string, TestResult>;

  constructor() {
    this.server = new Server(
      {
        name: 'test-validator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.results = new Map();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async runJestTests(projectPath: string, config: TestConfig): Promise<TestResult> {
    try {
      const args = ['--json'];
      
      if (config.coverage) {
        args.push('--coverage');
      }
      
      if (config.timeout) {
        args.push(`--testTimeout=${config.timeout}`);
      }
      
      if (config.testMatch) {
        args.push(`--testMatch=${JSON.stringify(config.testMatch)}`);
      }

      const { stdout } = await execAsync(`npx jest ${args.join(' ')}`, {
        cwd: projectPath
      });

      const result = JSON.parse(stdout);
      
      return {
        passed: result.success,
        suites: result.numTotalTestSuites,
        tests: result.numTotalTests,
        passed_tests: result.numPassedTests,
        failed_tests: result.numFailedTests,
        skipped_tests: result.numPendingTests,
        duration: result.startTime - result.endTime,
        coverage: result.coverageMap ? {
          statements: result.coverageMap.statements.pct,
          branches: result.coverageMap.branches.pct,
          functions: result.coverageMap.functions.pct,
          lines: result.coverageMap.lines.pct
        } : undefined
      };
    } catch (error) {
      return {
        passed: false,
        suites: 0,
        tests: 0,
        passed_tests: 0,
        failed_tests: 0,
        skipped_tests: 0,
        duration: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async runMochaTests(projectPath: string, config: TestConfig): Promise<TestResult> {
    try {
      const args = ['--reporter=json'];
      
      if (config.coverage) {
        args.push('--coverage');
      }
      
      if (config.timeout) {
        args.push(`--timeout=${config.timeout}`);
      }
      
      if (config.testMatch) {
        args.push(...config.testMatch);
      }

      const { stdout } = await execAsync(`npx mocha ${args.join(' ')}`, {
        cwd: projectPath
      });

      const result = JSON.parse(stdout);
      
      return {
        passed: result.stats.failures === 0,
        suites: result.stats.suites,
        tests: result.stats.tests,
        passed_tests: result.stats.passes,
        failed_tests: result.stats.failures,
        skipped_tests: result.stats.pending,
        duration: result.stats.duration,
        coverage: result.coverage ? {
          statements: result.coverage.statements.pct,
          branches: result.coverage.branches.pct,
          functions: result.coverage.functions.pct,
          lines: result.coverage.lines.pct
        } : undefined
      };
    } catch (error) {
      return {
        passed: false,
        suites: 0,
        tests: 0,
        passed_tests: 0,
        failed_tests: 0,
        skipped_tests: 0,
        duration: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'run_tests',
          description: 'Executa testes em um projeto',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Caminho do projeto'
              },
              config: {
                type: 'object',
                properties: {
                  framework: {
                    type: 'string',
                    enum: ['jest', 'mocha'],
                    description: 'Framework de testes'
                  },
                  testMatch: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Padrões para encontrar arquivos de teste'
                  },
                  coverage: {
                    type: 'boolean',
                    description: 'Coletar cobertura de código'
                  },
                  timeout: {
                    type: 'number',
                    description: 'Timeout em milissegundos'
                  }
                },
                required: ['framework']
              }
            },
            required: ['projectPath', 'config']
          }
        },
        {
          name: 'get_test_result',
          description: 'Obtém o resultado de uma execução de testes',
          inputSchema: {
            type: 'object',
            properties: {
              resultId: {
                type: 'string',
                description: 'ID do resultado'
              }
            },
            required: ['resultId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'run_tests': {
          const { projectPath, config } = request.params.arguments as {
            projectPath: string;
            config: TestConfig;
          };

          try {
            const resolvedPath = path.resolve(projectPath);
            let result: TestResult;

            switch (config.framework) {
              case 'jest':
                result = await this.runJestTests(resolvedPath, config);
                break;
              case 'mocha':
                result = await this.runMochaTests(resolvedPath, config);
                break;
              default:
                throw new McpError(
                  ErrorCode.InvalidParams,
                  `Framework não suportado: ${config.framework}`
                );
            }

            const resultId = Buffer.from(Date.now().toString()).toString('hex');
            this.results.set(resultId, result);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ resultId, result }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao executar testes: ${error}`
            );
          }
        }

        case 'get_test_result': {
          const { resultId } = request.params.arguments as {
            resultId: string;
          };

          const result = this.results.get(resultId);
          if (!result) {
            throw new McpError(
              ErrorCode.InternalError,
              `Resultado não encontrado: ${resultId}`
            );
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
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
    logger.info('Test Validator MCP server running on stdio');
  }
}

const server = new TestValidatorServer();
server.run().catch(logger.error);