#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import screenshot from 'screenshot-desktop';
import * as si from 'systeminformation';
import winston from 'winston';

interface ShellAnalysis {
  currentShell: {
    name: string;
    path: string;
    isDefault: boolean;
    isSupported: boolean;
  };
  defaultShell: {
    name: string;
  };
  configPath: string;
  issues: string[];
  recommendations: string[];
}

interface VSCodeProcess {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
}

interface SystemInfo {
  os: {
    platform: string;
    distro: string;
    release: string;
    kernel: string;
    arch: string;
    hostname: string;
  };
  shell: {
    name: string;
    path: string;
  };
  cpu: {
    manufacturer: string;
    brand: string;
    speed: string;
    cores: number;
    physicalCores: number;
    loadPercentage: number;
  };
  memory: {
    total: string;
    free: string;
    used: string;
    usedPercentage: string;
  };
  vscode: {
    processes: {
      pid: number;
      name: string;
      cpu: number;
      memory: string;
    }[];
  };
  lastScreenshot: string | null;
  timestamp: string;
}

interface ShellInfo {
  name: string;
  path: string;
  default?: string;
}

// Função auxiliar para converter retorno do si.shell() em ShellInfo
const parseShellInfo = async (): Promise<ShellInfo> => {
  try {
    const shellData = await si.shell();
    // Garantir que temos um valor padrão mesmo se o shellData for uma string
    const defaultShell = process.env.SHELL || 'unknown';
    return {
      name: defaultShell,
      path: defaultShell,
      default: defaultShell
    };
  } catch (error) {
    console.error('Erro ao obter informações do shell:', error);
    const defaultShell = process.env.SHELL || 'unknown';
    return {
      name: defaultShell,
      path: defaultShell,
      default: defaultShell
    };
  }
};

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.metadata({
      fillWith: ['timestamp', 'level', 'message']
    }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Criar diretório de logs se não existir
import { mkdirSync, existsSync } from 'fs';
if (!existsSync('logs')) {
  mkdirSync('logs');
}

// Função auxiliar para formatar bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

class VSCodeMonitorServer {
  private server: Server;
  private lastScreenshot: string | null = null;
  private monitoringActive: boolean = false;
  private shellIntegrationPattern = /Shell Integration Unavailable/i;
  private lastErrorCheck: number = 0;
  private errorCheckInterval: number = 5000; // 5 segundos
  private supportedShells = ['powershell.exe', 'pwsh.exe', 'bash.exe', 'zsh.exe', 'fish.exe', 'cmd.exe'];
  private shellConfigPaths: { [key: string]: string } = {
    powershell: '$HOME\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1',
    pwsh: '$HOME\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1',
    bash: '$HOME\\.bashrc',
    zsh: '$HOME\\.zshrc',
    fish: '$HOME\\.config\\fish\\config.fish'
  };

  constructor() {
    this.server = new Server(
      {
        name: 'vscode-monitor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => logger.error('MCP Error:', error);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'start_monitoring',
          description: 'Inicia o monitoramento do VSCode',
          inputSchema: {
            type: 'object',
            properties: {
              captureInterval: {
                type: 'number',
                description: 'Intervalo em segundos para captura de informações',
                minimum: 1
              }
            },
            required: ['captureInterval']
          }
        },
        {
          name: 'stop_monitoring',
          description: 'Para o monitoramento do VSCode',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get_system_info',
          description: 'Obtém informações do sistema',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'start_monitoring':
          return await this.handleStartMonitoring(request.params.arguments);
        case 'stop_monitoring':
          return await this.handleStopMonitoring();
        case 'get_system_info':
          return await this.handleGetSystemInfo();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Ferramenta desconhecida: ${request.params.name}`
          );
      }
    });
  }

  private async handleStartMonitoring(args: any) {
    if (this.monitoringActive) {
      return {
        content: [
          {
            type: 'text',
            text: 'Monitoramento já está ativo'
          }
        ]
      };
    }

    const interval = args.captureInterval * 1000;
    this.monitoringActive = true;

    // Inicia o loop de monitoramento
    this.startMonitoringLoop(interval);

    return {
      content: [
        {
          type: 'text',
          text: `Monitoramento iniciado com intervalo de ${args.captureInterval} segundos`
        }
      ]
    };
  }

  private async handleStopMonitoring() {
    this.monitoringActive = false;
    return {
      content: [
        {
          type: 'text',
          text: 'Monitoramento interrompido'
        }
      ]
    };
  }

  private async analyzeShellConfiguration(): Promise<ShellAnalysis> {
    const osInfo = await si.osInfo();
    const shellInfo = await parseShellInfo();
    const defaultShell = shellInfo.default || '';

    const shellName = shellInfo.name.toLowerCase();
    const isSupported = this.supportedShells.some(s =>
      shellName.includes(s.replace('.exe', ''))
    );

    const analysis: ShellAnalysis = {
      currentShell: {
        name: shellInfo.name,
        path: shellInfo.path,
        isDefault: shellInfo.name === defaultShell,
        isSupported
      },
      defaultShell: {
        name: defaultShell
      },
      configPath: this.shellConfigPaths[shellName.split('.')[0]] || 'Não identificado',
      issues: [],
      recommendations: []
    };

    // Análise de problemas comuns
    if (!isSupported) {
      analysis.issues.push(`Shell atual (${shellInfo.name}) não é oficialmente suportado pelo VSCode`);
      analysis.recommendations.push('Considere mudar para PowerShell, Bash, Zsh ou Fish');
    }

    if (shellInfo.name !== defaultShell) {
      analysis.issues.push('Shell atual não é o shell padrão do sistema');
      analysis.recommendations.push('Configure o shell atual como padrão no VSCode ou use o shell padrão do sistema');
    }

    // Verifica permissões e existência do shell
    try {
      const shellStats = await si.processes();
      const shellProcess = shellStats.list.find(p =>
        p.name.toLowerCase() === shellName ||
        p.name.toLowerCase().includes(shellName.replace('.exe', ''))
      );

      if (!shellProcess) {
        analysis.issues.push('Processo do shell não encontrado');
        analysis.recommendations.push('Verifique se o shell está instalado corretamente');
      }
    } catch (error) {
      logger.error('Erro ao verificar processo do shell:', error);
    }

    logger.info('Shell Configuration Analysis', { analysis });
    return analysis;
  }

  private async handleGetSystemInfo() {
    const [osInfo, cpuInfo, memory, processes] = await Promise.all([
      si.osInfo(),
      si.cpu(),
      si.mem(),
      si.processes()
    ]);

    const shellInfo = await parseShellInfo();
    const shellAnalysis = await this.analyzeShellConfiguration();

    // Filtrar processos do VSCode
    const vscodeProcesses = processes.list.filter(p =>
      p.name.toLowerCase().includes('code') ||
      p.name.toLowerCase().includes('vscode')
    );

    const systemInfo: SystemInfo = {
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        kernel: osInfo.kernel,
        arch: osInfo.arch,
        hostname: osInfo.hostname
      },
      shell: {
        name: shellInfo.name,
        path: shellInfo.path
      },
      cpu: {
        manufacturer: cpuInfo.manufacturer,
        brand: cpuInfo.brand,
        speed: `${cpuInfo.speed}GHz`,
        cores: cpuInfo.cores,
        physicalCores: cpuInfo.physicalCores,
        loadPercentage: cpuInfo.speed // Usando speed como aproximação da carga
      },
      memory: {
        total: formatBytes(memory.total),
        free: formatBytes(memory.free),
        used: formatBytes(memory.used),
        usedPercentage: ((memory.used / memory.total) * 100).toFixed(2) + '%'
      },
      vscode: {
        processes: vscodeProcesses.map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          memory: formatBytes(p.mem)
        }))
      },
      lastScreenshot: this.lastScreenshot,
      timestamp: new Date().toISOString()
    };

    // Registrar informações no log
    logger.info('System Information Collected', { systemInfo });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(systemInfo, null, 2)
        }
      ]
    };
  }

  private async startMonitoringLoop(interval: number) {
    const monitoringLoop = async () => {
      if (!this.monitoringActive) return;

      try {
        const now = Date.now();
        
        // Verifica logs do VSCode em busca do erro de integração do shell
        if (now - this.lastErrorCheck >= this.errorCheckInterval) {
          this.lastErrorCheck = now;
          
          // Captura screenshot e informações do sistema apenas se detectar o erro
          const screenshotPath = `vscode-error-${now}.png`;
          await screenshot({ filename: screenshotPath });
          this.lastScreenshot = screenshotPath;

          // Registra informações detalhadas do sistema
          const [osInfo, cpuInfo, memory] = await Promise.all([
            si.osInfo(),
            si.cpu(),
            si.mem()
          ]);

          const shellInfo = await parseShellInfo();

          logger.info('Shell Integration Error Detected', {
            timestamp: new Date().toISOString(),
            screenshot: screenshotPath,
            system: {
              os: {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                kernel: osInfo.kernel
              },
              shell: {
                name: shellInfo.name,
                path: shellInfo.path
              },
              cpu: {
                manufacturer: cpuInfo.manufacturer,
                brand: cpuInfo.brand,
                speed: cpuInfo.speed,
                cores: cpuInfo.cores
              },
              memory: {
                total: memory.total,
                free: memory.free,
                used: memory.used
              }
            },
            possibleFixes: [
              'Atualizar o VSCode para a versão mais recente',
              'Verificar se o shell atual é suportado (zsh, bash, fish, ou PowerShell)',
              'Verificar permissões do terminal',
              'Reiniciar o VSCode'
            ]
          });
        }

        // Agenda próxima execução se ainda estiver ativo
        if (this.monitoringActive) {
          setTimeout(monitoringLoop, interval);
        }
      } catch (error) {
        logger.error('Erro durante monitoramento:', error);
        if (this.monitoringActive) {
          setTimeout(monitoringLoop, interval);
        }
      }
    };

    // Inicia o loop
    monitoringLoop();
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('VSCode Monitor MCP server iniciado');
  }
}

const server = new VSCodeMonitorServer();
server.run().catch((error) => {
  logger.error('Erro fatal:', error);
  process.exit(1);
});