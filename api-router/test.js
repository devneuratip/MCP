import { ApiRouter } from './build/api-router.js';
import { RouterConfig } from './build/types.js';

const config = {
  rotationStrategy: 'round-robin',
  messageCompression: {
    maxTokens: 8000,
    summaryThreshold: 6000,
    compressionStrategy: 'hybrid'
  },
  fallbackEnabled: true,
  retryAttempts: 2,
  improvePromptEnabled: true
};

const apiRouter = new ApiRouter(config);

// Adiciona algumas chaves de API de teste
apiRouter.addApiKey({
  id: 'anthropic-1',
  key: 'test-key-1',
  provider: 'anthropic',
  model: 'claude-2',
  usageCount: 0,
  lastUsed: new Date()
});

apiRouter.addApiKey({
  id: 'anthropic-2',
  key: 'test-key-2',
  provider: 'anthropic',
  model: 'claude-2',
  usageCount: 0,
  lastUsed: new Date()
});

// Testa o processamento de uma requisição
const request = {
  messages: [
    {
      type: 'system',
      content: 'You are a helpful assistant.',
      role: 'system'
    },
    {
      type: 'message',
      content: 'Hello, how are you?',
      role: 'user'
    }
  ],
  model: 'claude-2',
  provider: 'anthropic'
};

async function test() {
  try {
    console.log('Testing API Router...');
    
    // Processa a requisição
    const response = await apiRouter.processRequest(request);
    console.log('Response:', response);
    
    // Obtém métricas
    const metrics = apiRouter.getMetrics();
    console.log('Metrics:', metrics);
    
    // Obtém pool de APIs
    const pool = apiRouter.getApiKeyPool();
    console.log('API Key Pool:', pool);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

test();