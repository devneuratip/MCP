# API Router MCP Server

O API Router é um servidor MCP que gerencia múltiplas chaves de API para providers como Anthropic, implementando funcionalidades similares ao OpenRouter mas de forma local no Cline.

## Funcionalidades

- Gerenciamento de múltiplas chaves de API por provider/modelo
- Estratégias de rotação de chaves (round-robin, least-used, random)
- Compressão automática de mensagens para respeitar limites de contexto
- Fallback automático em caso de erros de rate limit
- Métricas de uso por provider/modelo
- Suporte ao botão "Improve Prompt" independente do provider

## Configuração

No arquivo `cline_mcp_settings.json`, configure suas chaves de API:

```json
{
  "mcpServers": {
    "api-router": {
      "command": "node",
      "args": [
        "C:/Users/lucas/Documents/Cline/MCP/api-router/build/index.js"
      ],
      "disabled": false,
      "alwaysAllow": [
        "add_api_key",
        "process_request",
        "get_metrics",
        "update_config"
      ],
      "env": {
        "ANTHROPIC_API_KEYS": "${settings.anthropic.apiKeys}",
        "IMPROVE_PROMPT_ENABLED": "true"
      }
    }
  }
}
```

## Uso

### Adicionar uma chave de API

```typescript
const result = await mcp.callTool('api-router', 'add_api_key', {
  id: 'anthropic-1',
  key: 'sua-chave-api',
  provider: 'anthropic',
  model: 'claude-2'
});
```

### Processar uma requisição

```typescript
const result = await mcp.callTool('api-router', 'process_request', {
  messages: [
    {
      type: 'system',
      content: 'You are a helpful assistant.',
      role: 'system'
    },
    {
      type: 'message',
      content: 'Hello!',
      role: 'user'
    }
  ],
  model: 'claude-2',
  provider: 'anthropic'
});
```

### Obter métricas

```typescript
const metrics = await mcp.callTool('api-router', 'get_metrics', {});
```

### Atualizar configuração

```typescript
const config = await mcp.callTool('api-router', 'update_config', {
  rotationStrategy: 'round-robin',
  messageCompression: {
    maxTokens: 8000,
    summaryThreshold: 6000,
    compressionStrategy: 'hybrid'
  },
  fallbackEnabled: true,
  retryAttempts: 2,
  improvePromptEnabled: true
});
```

## Estratégias de Compressão

O servidor suporta três estratégias de compressão de mensagens:

- `truncate`: Remove mensagens antigas quando o contexto excede o limite
- `summarize`: Gera um resumo das mensagens antigas
- `hybrid`: Usa summarize para contextos grandes e truncate para pequenos

## Métricas Disponíveis

- Total de requisições
- Requisições bem-sucedidas
- Requisições com erro
- Total de tokens usados
- Tempo médio de resposta
- Hits de rate limit

## Desenvolvimento

Para compilar o projeto:

```bash
npm install
npm run build
```

Para testar:

```bash
node test.js