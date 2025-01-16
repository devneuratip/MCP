import winston from 'winston';
import { io, Socket } from 'socket.io-client';
import { CascadeAutomation } from './automation.js';
import { checkWebSocketAvailability } from './check-connection.js';

// Configuração do logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'connection-manager-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'connection-manager.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export enum ConnectionType {
  WEBSOCKET = 'websocket',
  AUTOMATION = 'automation',
  NONE = 'none'
}

interface ConnectionConfig {
  host: string;
  port: number;
  path: string;
  reconnectionAttempts: number;
  reconnectionDelay: number;
}

export class ConnectionManager {
  private socket: Socket | null = null;
  private automation: CascadeAutomation;
  private activeConnection: ConnectionType = ConnectionType.NONE;
  private config: ConnectionConfig;
  private wsTimeout: number = 3000; // 3 segundos para timeout do WebSocket

  constructor(config: ConnectionConfig) {
    this.config = config;
    this.automation = new CascadeAutomation();
  }

  async connect(): Promise<ConnectionType> {
    try {
      logger.info('Iniciando conexão...');

      // Verifica se o WebSocket está disponível
      const wsAvailable = await checkWebSocketAvailability(
        this.config.host,
        this.config.port,
        this.wsTimeout
      );

      if (wsAvailable) {
        logger.info('WebSocket disponível, tentando conectar...');
        const wsResult = await this.connectWebSocket();
        if (wsResult) {
          this.activeConnection = ConnectionType.WEBSOCKET;
          logger.info('Conectado via WebSocket');
          return ConnectionType.WEBSOCKET;
        }
      } else {
        logger.info('WebSocket não disponível, pulando para automação...');
      }

      // Se WebSocket não estiver disponível ou falhar, tenta automação
      const automationResult = await this.connectAutomation();
      if (automationResult) {
        this.activeConnection = ConnectionType.AUTOMATION;
        logger.info('Conectado via Automação');
        return ConnectionType.AUTOMATION;
      }

      this.activeConnection = ConnectionType.NONE;
      throw new Error('Não foi possível estabelecer conexão');
    } catch (error) {
      logger.error('Erro ao conectar:', error);
      throw error;
    }
  }

  private async connectWebSocket(): Promise<boolean> {
    try {
      const url = `http://${this.config.host}:${this.config.port}`;
      logger.info(`Tentando conectar WebSocket em ${url}`);

      this.socket = io(url, {
        path: this.config.path,
        reconnection: false, // Desabilita reconexão automática
        timeout: this.wsTimeout
      });

      return new Promise((resolve) => {
        if (!this.socket) {
          resolve(false);
          return;
        }

        // Define timeout
        const timeoutId = setTimeout(() => {
          logger.warn('Timeout na conexão WebSocket');
          this.socket?.disconnect();
          resolve(false);
        }, this.wsTimeout);

        this.socket.on('connect', () => {
          clearTimeout(timeoutId);
          resolve(true);
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          logger.error('Erro na conexão WebSocket:', error);
          resolve(false);
        });

        this.socket.on('disconnect', (reason) => {
          logger.warn(`WebSocket desconectado: ${reason}`);
          this.activeConnection = ConnectionType.NONE;
          this.fallbackToAutomation();
        });
      });
    } catch (error) {
      logger.error('Erro ao configurar WebSocket:', error);
      return false;
    }
  }

  private async connectAutomation(): Promise<boolean> {
    try {
      await this.automation.initialize();
      const ready = await this.automation.isPageReady();
      return ready;
    } catch (error) {
      logger.error('Erro ao inicializar automação:', error);
      return false;
    }
  }

  private async fallbackToAutomation() {
    logger.info('Iniciando fallback para automação...');
    try {
      const result = await this.connectAutomation();
      if (result) {
        this.activeConnection = ConnectionType.AUTOMATION;
        logger.info('Fallback para automação bem sucedido');
      } else {
        this.activeConnection = ConnectionType.NONE;
        logger.error('Fallback para automação falhou');
      }
    } catch (error) {
      logger.error('Erro no fallback para automação:', error);
      this.activeConnection = ConnectionType.NONE;
    }
  }

  async sendMessage(message: string): Promise<string> {
    try {
      switch (this.activeConnection) {
        case ConnectionType.WEBSOCKET:
          if (!this.socket?.connected) {
            logger.warn('WebSocket desconectado, tentando fallback...');
            await this.fallbackToAutomation();
            return this.sendMessage(message); // Tenta novamente com a nova conexão
          }
          return new Promise((resolve, reject) => {
            this.socket?.emit('message', { content: message }, (response: any) => {
              resolve(response.content);
            });
            setTimeout(() => reject(new Error('Timeout aguardando resposta')), 30000);
          });

        case ConnectionType.AUTOMATION:
          return await this.automation.sendMessage(message);

        default:
          throw new Error('Nenhuma conexão ativa');
      }
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  }

  getConnectionType(): ConnectionType {
    return this.activeConnection;
  }

  async cleanup() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    await this.automation.cleanup();
    this.activeConnection = ConnectionType.NONE;
  }
}