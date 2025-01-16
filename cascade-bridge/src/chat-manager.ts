import winston from 'winston';

// Configuração do logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'chat-manager-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'chat-manager.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export interface CascadeMessage {
  type: 'message' | 'system';
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp?: string;
}

export interface ChatConfig {
  id: string;
  model: string;
  messages: CascadeMessage[];
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export class ChatManager {
  private chats: Map<string, ChatConfig>;

  constructor() {
    this.chats = new Map();
  }

  createChat(model: string, systemPrompt?: string): string {
    const id = Math.random().toString(36).substring(7);
    const now = new Date().toISOString();

    const config: ChatConfig = {
      id,
      model,
      messages: [],
      systemPrompt,
      createdAt: now,
      updatedAt: now
    };

    this.chats.set(id, config);
    logger.debug('Novo chat criado:', { id, model, systemPrompt });
    return id;
  }

  getChat(chatId: string): ChatConfig | undefined {
    return this.chats.get(chatId);
  }

  addMessage(chatId: string, message: CascadeMessage): boolean {
    const chat = this.chats.get(chatId);
    if (!chat) {
      logger.error('Tentativa de adicionar mensagem a chat inexistente:', chatId);
      return false;
    }

    // Adiciona timestamp se não fornecido
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    chat.messages.push(message);
    chat.updatedAt = new Date().toISOString();
    this.chats.set(chatId, chat);

    logger.debug('Mensagem adicionada ao chat:', { chatId, message });
    return true;
  }

  updateSystemPrompt(chatId: string, systemPrompt: string): boolean {
    const chat = this.chats.get(chatId);
    if (!chat) {
      logger.error('Tentativa de atualizar prompt de chat inexistente:', chatId);
      return false;
    }

    chat.systemPrompt = systemPrompt;
    chat.updatedAt = new Date().toISOString();
    this.chats.set(chatId, chat);

    logger.debug('Prompt do sistema atualizado:', { chatId, systemPrompt });
    return true;
  }

  deleteChat(chatId: string): boolean {
    if (!this.chats.has(chatId)) {
      logger.error('Tentativa de deletar chat inexistente:', chatId);
      return false;
    }

    this.chats.delete(chatId);
    logger.debug('Chat removido:', chatId);
    return true;
  }

  getChatHistory(chatId: string): CascadeMessage[] {
    const chat = this.chats.get(chatId);
    if (!chat) {
      logger.error('Tentativa de obter histórico de chat inexistente:', chatId);
      return [];
    }
    return chat.messages;
  }

  listChats(): ChatConfig[] {
    return Array.from(this.chats.values());
  }

  // Método para persistir chats em disco (pode ser implementado depois)
  async persistChats(): Promise<void> {
    // TODO: Implementar persistência em disco ou banco de dados
    logger.info('Persistência de chats não implementada');
  }

  // Método para carregar chats do disco (pode ser implementado depois)
  async loadChats(): Promise<void> {
    // TODO: Implementar carregamento de chats persistidos
    logger.info('Carregamento de chats persistidos não implementado');
  }

  // Método para limpar chats antigos
  cleanupOldChats(maxAgeHours: number = 24): void {
    const now = new Date();
    for (const [id, chat] of this.chats.entries()) {
      const lastUpdate = new Date(chat.updatedAt);
      const ageHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
      
      if (ageHours > maxAgeHours) {
        this.chats.delete(id);
        logger.debug('Chat antigo removido:', { id, ageHours });
      }
    }
  }
}