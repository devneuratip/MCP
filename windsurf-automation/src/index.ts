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
import puppeteer from 'puppeteer';

// Configuração do logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'windsurf-automation-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'windsurf-automation.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Configurações
const CONFIG = {
  cascade: {
    chatButtonSelector: '[data-testid="chat-button"]',
    messageInputSelector: '[data-testid="message-input"]',
    sendButtonSelector: '[data-testid="send-button"]',
    responseSelector: '[data-testid="assistant-message"]',
    proceedButtonSelector: 'button:has-text("Proceed while running")'
  },
  delays: {
    typing: 50, // ms entre cada caractere
    click: 500, // ms após cada clique
    response: 5000, // ms esperando resposta
    autoClickTimeout: process.env.CLINE_AUTO_PROCEED_TIMEOUT ? parseInt(process.env.CLINE_AUTO_PROCEED_TIMEOUT) : 10000 // ms antes de clicar automaticamente no botão proceed
  }
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

class WindsurfAutomation {
  private server: Server;
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;
  private activeChats: Map<string, ChatMessage[]> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'windsurf-automation',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => logger.error('[MCP Error]', error);
    
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup() {
    logger.info('Iniciando limpeza...');
    if (this.browser) {
      await this.browser.close();
    }
    await this.server.close();
    logger.info('Limpeza concluída');
  }

  private async initializePuppeteer() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
      });
      this.page = await this.browser.newPage();
    }
  }

  private async typeMessage(message: string) {
    if (!this.page) throw new Error('Página não inicializada');

    // Simula digitação humana com delays aleatórios
    for (const char of message) {
      await this.page.keyboard.type(char);
      await new Promise(resolve => setTimeout(resolve, CONFIG.delays.typing + Math.random() * 30));
    }
  }

  private async clickElement(selector: string, optional: boolean = false) {
    if (!this.page) throw new Error('Página não inicializada');
    
    const element = await this.page.$(selector);
    if (!element) {
      if (optional) return false;
      throw new Error(`Elemento não encontrado: ${selector}`);
    }

    await element.click();
    await new Promise(resolve => setTimeout(resolve, CONFIG.delays.click));
    return true;
  }

  private async setupAutoProceed() {
    if (!this.page) throw new Error('Página não inicializada');

    // Configura um timer para tentar clicar no botão proceed após o timeout
    setTimeout(async () => {
      try {
        // Tenta encontrar o botão várias vezes
        let attempts = 0;
        const maxAttempts = 5;
        const retryInterval = 1000; // 1 segundo entre tentativas

        const tryClickProceed = async () => {
          try {
            const clicked = await this.clickElement(CONFIG.cascade.proceedButtonSelector, true);
            if (clicked) {
              logger.info('Auto-clicked proceed button after timeout');
              return true;
            }
          } catch (error) {
            logger.debug('Attempt to click proceed button failed:', error);
          }
          return false;
        };

        while (attempts < maxAttempts) {
          if (await tryClickProceed()) break;
          
          attempts++;
          if (attempts < maxAttempts) {
            logger.debug(`Proceed button not found, retrying in ${retryInterval}ms (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, retryInterval));
          }
        }

        if (attempts >= maxAttempts) {
          logger.warn('Failed to find proceed button after all attempts');
        }
      } catch (error) {
        logger.error('Error in auto-proceed sequence:', error);
      }
    }, CONFIG.delays.autoClickTimeout);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'open_chat',
          description: 'Abre o Chat with Cascade no Windsurf Editor',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'send_message',
          description: 'Envia uma mensagem para o Chat with Cascade',
          inputSchema: {
            type: 'object',
            properties: {
              chatId: {
                type: 'string',
                description: 'ID do chat'
              },
              message: {
                type: 'string',
                description: 'Mensagem a ser enviada'
              }
            },
            required: ['chatId', 'message']
          }
        },
        {
          name: 'get_chat_history',
          description: 'Obtém o histórico de mensagens de um chat',
          inputSchema: {
            type: 'object',
            properties: {
              chatId: {
                type: 'string',
                description: 'ID do chat'
              }
            },
            required: ['chatId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        switch (request.params.name) {
          case 'open_chat': {
            await this.initializePuppeteer();
            if (!this.page) throw new Error('Página não inicializada');

            // Navega para o Chat with Cascade
            await this.clickElement(CONFIG.cascade.chatButtonSelector);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ message: 'Chat aberto com sucesso' })
                }
              ]
            };
          }

          case 'send_message': {
            const { chatId, message } = request.params.arguments;
            
            if (!this.page) throw new Error('Chat não inicializado');

            // Clica no campo de mensagem
            await this.clickElement(CONFIG.cascade.messageInputSelector);

            // Digita a mensagem
            await this.typeMessage(message);

            // Clica no botão de enviar
            await this.clickElement(CONFIG.cascade.sendButtonSelector);

            let response = '';
            try {
              // Aguarda e captura a resposta
              await this.page.waitForSelector(CONFIG.cascade.responseSelector, { timeout: CONFIG.delays.response });
              const responseElement = await this.page.$(CONFIG.cascade.responseSelector);
              response = await responseElement?.evaluate(el => el.textContent) || '';
            } catch (error) {
              logger.warn('Timeout esperando resposta, ativando auto-proceed');
              response = 'Resposta não capturada - timeout atingido';
              
              // Só configura o auto-proceed se tivermos um timeout
              await this.setupAutoProceed();
            }

            // Armazena mensagens no histórico mesmo em caso de timeout
            if (!this.activeChats.has(chatId)) {
              this.activeChats.set(chatId, []);
            }
            const chat = this.activeChats.get(chatId)!;
            chat.push({ role: 'user', content: message });
            chat.push({ role: 'assistant', content: response });

            return {
              content: [
                {
                  type: 'text',
                  text: response
                }
              ]
            };
          }

          case 'get_chat_history': {
            const { chatId } = request.params.arguments;
            
            const chat = this.activeChats.get(chatId);
            if (!chat) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Chat não encontrado: ${chatId}`
              );
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(chat)
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
      } catch (error: any) {
        logger.error('Erro ao executar ferramenta:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Erro ao executar ferramenta: ${error.message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Windsurf Automation MCP server running on stdio');
  }
}

const automation = new WindsurfAutomation();
automation.run().catch((error: Error) => {
  logger.error('Erro fatal no servidor:', error);
  process.exit(1);
});
