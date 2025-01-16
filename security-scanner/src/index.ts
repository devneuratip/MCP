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
import NodeCache from 'node-cache';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  location?: string;
  recommendation?: string;
}

interface ScanResult {
  issues: SecurityIssue[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  timestamp: string;
}

class SecurityScannerServer {
  private server: Server;
  private cache: NodeCache;
  private scanResults: Map<string, ScanResult>;

  constructor() {
    this.server = new Server(
      {
        name: 'security-scanner',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de TTL
    this.scanResults = new Map();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async runDependencyCheck(projectPath: string): Promise<SecurityIssue[]> {
    try {
      const { stdout } = await execAsync(`npx dependency-check ${projectPath} --format json`);
      const result = JSON.parse(stdout);
      return result.dependencies.map((dep: any) => ({
        severity: this.mapSeverity(dep.severity),
        type: 'dependency',
        description: `Vulnerabilidade encontrada em ${dep.name}@${dep.version}`,
        recommendation: dep.recommendation
      }));
    } catch (error) {
      logger.error('Erro ao executar dependency-check:', error);
      return [];
    }
  }

  private async runSnykScan(projectPath: string): Promise<SecurityIssue[]> {
    try {
      const { stdout } = await execAsync(`npx snyk test ${projectPath} --json`);
      const result = JSON.parse(stdout);
      return result.vulnerabilities.map((vuln: any) => ({
        severity: this.mapSeverity(vuln.severity),
        type: 'vulnerability',
        description: vuln.title,
        location: vuln.from.join(' > '),
        recommendation: vuln.fix
      }));
    } catch (error) {
      logger.error('Erro ao executar snyk:', error);
      return [];
    }
  }

  private async runAuditCI(projectPath: string): Promise<SecurityIssue[]> {
    try {
      const { stdout } = await execAsync(`npx audit-ci --directory ${projectPath} --report-type full --json`);
      const result = JSON.parse(stdout);
      return result.advisories.map((adv: any) => ({
        severity: this.mapSeverity(adv.severity),
        type: 'audit',
        description: adv.title,
        location: adv.module_name,
        recommendation: adv.recommendation
      }));
    } catch (error) {
      logger.error('Erro ao executar audit-ci:', error);
      return [];
    }
  }

  private mapSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      default:
        return 'low';
    }
  }

  private summarizeIssues(issues: SecurityIssue[]): ScanResult['summary'] {
    return issues.reduce((summary, issue) => {
      summary.total++;
      summary[issue.severity]++;
      return summary;
    }, {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'scan_project',
          description: 'Executa uma varredura de segurança em um projeto',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Caminho do projeto para analisar'
              },
              scanTypes: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['dependencies', 'vulnerabilities', 'audit']
                },
                description: 'Tipos de varredura a executar'
              }
            },
            required: ['projectPath']
          }
        },
        {
          name: 'get_scan_result',
          description: 'Obtém o resultado de uma varredura anterior',
          inputSchema: {
            type: 'object',
            properties: {
              scanId: {
                type: 'string',
                description: 'ID da varredura'
              }
            },
            required: ['scanId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'scan_project': {
          const { projectPath, scanTypes = ['dependencies', 'vulnerabilities', 'audit'] } = 
            request.params.arguments as {
              projectPath: string;
              scanTypes?: string[];
            };

          try {
            const issues: SecurityIssue[] = [];
            const resolvedPath = path.resolve(projectPath);

            if (scanTypes.includes('dependencies')) {
              const depIssues = await this.runDependencyCheck(resolvedPath);
              issues.push(...depIssues);
            }

            if (scanTypes.includes('vulnerabilities')) {
              const vulnIssues = await this.runSnykScan(resolvedPath);
              issues.push(...vulnIssues);
            }

            if (scanTypes.includes('audit')) {
              const auditIssues = await this.runAuditCI(resolvedPath);
              issues.push(...auditIssues);
            }

            const scanId = Buffer.from(Date.now().toString()).toString('hex');
            const result: ScanResult = {
              issues,
              summary: this.summarizeIssues(issues),
              timestamp: new Date().toISOString()
            };

            this.scanResults.set(scanId, result);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ scanId, result }, null, 2)
                }
              ]
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Erro ao executar varredura: ${error}`
            );
          }
        }

        case 'get_scan_result': {
          const { scanId } = request.params.arguments as {
            scanId: string;
          };

          const result = this.scanResults.get(scanId);
          if (!result) {
            throw new McpError(
              ErrorCode.InternalError,
              `Resultado da varredura não encontrado: ${scanId}`
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
    logger.info('Security Scanner MCP server running on stdio');
  }
}

const server = new SecurityScannerServer();
server.run().catch(logger.error);
