import puppeteer from 'puppeteer';
import winston from 'winston';

// Configuração do logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'cascade-automation-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'cascade-automation.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Configurações
export const CONFIG = {
  selectors: {
    chatButton: '.chat-button',
    messageInput: '.message-input',
    sendButton: '.send-button',
    responseText: '.assistant-message'
  },
  delays: {
    typing: 50,
    click: 500,
    response: 5000
  }
};

export class CascadeAutomation {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;

  async initialize() {
    if (!this.browser) {
      try {
        this.browser = await puppeteer.launch({
          headless: false,
          defaultViewport: null,
          args: ['--start-maximized']
        });
        this.page = await this.browser.newPage();
        logger.info('Navegador inicializado com sucesso');
      } catch (error) {
        logger.error('Erro ao inicializar navegador:', error);
        throw error;
      }
    }
    return this.page;
  }

  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        logger.info('Navegador fechado com sucesso');
      } catch (error) {
        logger.error('Erro ao fechar navegador:', error);
        throw error;
      }
    }
  }

  async openChat() {
    try {
      const page = await this.initialize();
      if (!page) throw new Error('Página não inicializada');

      await page.click(CONFIG.selectors.chatButton);
      logger.debug('Chat aberto com sucesso');
    } catch (error) {
      logger.error('Erro ao abrir chat:', error);
      throw error;
    }
  }

  async sendMessage(message: string): Promise<string> {
    try {
      const page = await this.initialize();
      if (!page) throw new Error('Página não inicializada');

      // Clica no campo de mensagem
      await page.click(CONFIG.selectors.messageInput);

      // Digita a mensagem com delays aleatórios para simular digitação humana
      for (const char of message) {
        await page.keyboard.type(char);
        await new Promise(resolve => setTimeout(resolve, CONFIG.delays.typing + Math.random() * 30));
      }

      // Envia a mensagem
      await page.click(CONFIG.selectors.sendButton);

      // Aguarda e captura a resposta
      await page.waitForSelector(CONFIG.selectors.responseText, { timeout: CONFIG.delays.response });
      const responseElement = await page.$(CONFIG.selectors.responseText);
      const response = await responseElement?.evaluate(el => el.textContent) || '';

      logger.debug('Mensagem enviada e resposta recebida:', { message, response });
      return response;
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  }

  async isPageReady(): Promise<boolean> {
    try {
      const page = await this.initialize();
      if (!page) return false;

      // Verifica se os elementos essenciais estão presentes
      const chatButton = await page.$(CONFIG.selectors.chatButton);
      const messageInput = await page.$(CONFIG.selectors.messageInput);
      const sendButton = await page.$(CONFIG.selectors.sendButton);

      return !!(chatButton && messageInput && sendButton);
    } catch (error) {
      logger.error('Erro ao verificar estado da página:', error);
      return false;
    }
  }

  async waitForResponse(timeout = CONFIG.delays.response): Promise<string> {
    try {
      const page = await this.initialize();
      if (!page) throw new Error('Página não inicializada');

      await page.waitForSelector(CONFIG.selectors.responseText, { timeout });
      const responseElement = await page.$(CONFIG.selectors.responseText);
      const response = await responseElement?.evaluate(el => el.textContent) || '';

      logger.debug('Resposta recebida:', response);
      return response;
    } catch (error) {
      logger.error('Erro ao aguardar resposta:', error);
      throw error;
    }
  }
}