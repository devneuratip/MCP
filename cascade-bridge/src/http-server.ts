import express from 'express';
import cors from 'cors';
import winston from 'winston';
import { ConnectionManager, ConnectionType } from './connection-manager.js';
import { ChatManager } from './chat-manager.js';

// Configuração do logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'http-server-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'http-server.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

interface CreateChatBody {
  model: string;
  systemPrompt?: string;
}

interface SendMessageBody {
  content: string;
}

interface UpdateChatBody {
  systemPrompt?: string;
}

export class HttpServer {
  private app: express.Application;
  private router: express.Router;
  private connectionManager: ConnectionManager;
  private chatManager: ChatManager;

  constructor(connectionManager: ConnectionManager, chatManager: ChatManager) {
    this.app = express();
    this.router = express.Router();
    this.connectionManager = connectionManager;
    this.chatManager = chatManager;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Endpoint para criar um novo chat
    this.router.post('/chat', async (req: express.Request, res: express.Response) => {
      try {
        const { model, systemPrompt } = req.body as CreateChatBody;

        // Tenta estabelecer conexão se não houver
        if (this.connectionManager.getConnectionType() === ConnectionType.NONE) {
          await this.connectionManager.connect();
        }

        const chatId = this.chatManager.createChat(model, systemPrompt);

        if (systemPrompt) {
          // Envia o prompt do sistema
          const response = await this.connectionManager.sendMessage(systemPrompt);
          this.chatManager.addMessage(chatId, {
            type: 'system',
            content: systemPrompt,
            role: 'system'
          });
          this.chatManager.addMessage(chatId, {
            type: 'message',
            content: response,
            role: 'assistant'
          });
        }

        logger.debug('Novo chat HTTP criado:', { chatId, model, systemPrompt });
        res.json({ 
          chatId,
          connectionType: this.connectionManager.getConnectionType()
        });
      } catch (error) {
        logger.error('Erro ao criar chat:', error);
        res.status(500).json({ error: 'Erro interno ao criar chat' });
      }
    });

    // Endpoint para enviar mensagem
    this.router.post('/chat/:chatId/message', async (req: express.Request, res: express.Response) => {
      try {
        const { chatId } = req.params;
        const { content } = req.body as SendMessageBody;

        const chat = this.chatManager.getChat(chatId);
        if (!chat) {
          res.status(404).json({ error: 'Chat não encontrado' });
          return;
        }

        // Tenta estabelecer conexão se não houver
        if (this.connectionManager.getConnectionType() === ConnectionType.NONE) {
          await this.connectionManager.connect();
        }

        logger.debug(`Enviando mensagem HTTP para chat ${chatId}:`, content);

        // Envia a mensagem e aguarda resposta
        const response = await this.connectionManager.sendMessage(content);

        // Registra a mensagem e resposta no histórico
        this.chatManager.addMessage(chatId, {
          type: 'message',
          content,
          role: 'user'
        });
        this.chatManager.addMessage(chatId, {
          type: 'message',
          content: response,
          role: 'assistant'
        });

        logger.debug(`Resposta HTTP recebida do chat ${chatId}:`, response);
        res.json({ response });
      } catch (error) {
        logger.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Erro interno ao enviar mensagem' });
      }
    });

    // Endpoint para atualizar configurações do chat
    this.router.patch('/chat/:chatId', async (req: express.Request, res: express.Response) => {
      try {
        const { chatId } = req.params;
        const { systemPrompt } = req.body as UpdateChatBody;

        const chat = this.chatManager.getChat(chatId);
        if (!chat) {
          res.status(404).json({ error: 'Chat não encontrado' });
          return;
        }

        if (systemPrompt) {
          // Tenta estabelecer conexão se não houver
          if (this.connectionManager.getConnectionType() === ConnectionType.NONE) {
            await this.connectionManager.connect();
          }

          // Envia o novo prompt do sistema
          const response = await this.connectionManager.sendMessage(systemPrompt);
          this.chatManager.updateSystemPrompt(chatId, systemPrompt);
          this.chatManager.addMessage(chatId, {
            type: 'system',
            content: systemPrompt,
            role: 'system'
          });
          this.chatManager.addMessage(chatId, {
            type: 'message',
            content: response,
            role: 'assistant'
          });
        }

        res.json({ message: 'Chat atualizado com sucesso' });
      } catch (error) {
        logger.error('Erro ao atualizar chat:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar chat' });
      }
    });

    // Endpoint para deletar chat
    this.router.delete('/chat/:chatId', async (req: express.Request, res: express.Response) => {
      try {
        const { chatId } = req.params;

        if (!this.chatManager.deleteChat(chatId)) {
          res.status(404).json({ error: 'Chat não encontrado' });
          return;
        }

        res.json({ message: 'Chat removido com sucesso' });
      } catch (error) {
        logger.error('Erro ao deletar chat:', error);
        res.status(500).json({ error: 'Erro interno ao deletar chat' });
      }
    });

    // Endpoint para obter histórico do chat
    this.router.get('/chat/:chatId/history', (req: express.Request, res: express.Response) => {
      try {
        const { chatId } = req.params;
        const messages = this.chatManager.getChatHistory(chatId);
        res.json({ messages });
      } catch (error) {
        logger.error('Erro ao obter histórico:', error);
        res.status(500).json({ error: 'Erro interno ao obter histórico' });
      }
    });

    // Endpoint para listar todos os chats
    this.router.get('/chats', (_req: express.Request, res: express.Response) => {
      try {
        const chats = this.chatManager.listChats();
        res.json({ chats });
      } catch (error) {
        logger.error('Erro ao listar chats:', error);
        res.status(500).json({ error: 'Erro interno ao listar chats' });
      }
    });

    // Endpoint para obter status da conexão
    this.router.get('/status', (_req: express.Request, res: express.Response) => {
      try {
        const status = {
          type: this.connectionManager.getConnectionType(),
          timestamp: new Date().toISOString()
        };
        res.json(status);
      } catch (error) {
        logger.error('Erro ao obter status:', error);
        res.status(500).json({ error: 'Erro interno ao obter status' });
      }
    });

    // Monta o router no caminho /cascade
    this.app.use('/cascade', this.router);
  }

  start(port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.app.listen(port, () => {
          logger.info(`Servidor HTTP rodando na porta ${port}`);
          resolve();
        });
      } catch (error) {
        logger.error('Erro ao iniciar servidor HTTP:', error);
        reject(error);
      }
    });
  }

  getApp() {
    return this.app;
  }
}