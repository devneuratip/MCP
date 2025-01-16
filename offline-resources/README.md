 # Offline Resources MCP Server

Servidor MCP para gerenciamento de recursos offline, permitindo cache local de repositórios GitHub e documentações de API.

## Funcionalidades

- Cache local de repositórios GitHub
- Download e cache de documentação de APIs
- Sincronização automática quando online
- Gerenciamento inteligente de cache
- Suporte a recursos estáticos (CSS, JS, imagens)

## Instalação

```bash
npm install
npm run build
```

## Estrutura de Diretórios

```
offline-resources/
├── repositories/     # Cache de repositórios GitHub
├── api-docs/         # Documentações de API
├── webpages/        # Outros recursos web
└── logs/            # Arquivos de log
```

## Uso

### Cache de Repositório GitHub

```typescript
// Cache de um repositório específico
await handleCacheRepository({
  url: "https://github.com/usuario/repo",
  branch: "main" // opcional, default: "main"
});
```

### Cache de Documentação de API

```typescript
// Cache de documentação com profundidade específica
await handleCacheApiDocs({
  url: "https://api.exemplo.com/docs",
  depth: 2 // opcional, default: 2
});
```

### Sincronização de Todos os Recursos

```typescript
// Atualiza todos os recursos em cache
await handleSyncAll();
```

### Listar Recursos em Cache

```typescript
// Lista todos os recursos ou filtra por tipo
await handleListResources({
  type: "all" // ou "repository", "api-doc", "webpage"
});
```

## Configuração de Cache

- Repositórios GitHub: TTL de 24 horas
- Documentação de API: TTL de 12 horas
- Verificação de cache a cada 24 horas

## Funcionalidades Detalhadas

### Cache de Repositórios

- Clone raso (depth: 1) para economia de espaço
- Suporte a branches específicas
- Atualização automática de repositórios existentes
- Cálculo de tamanho e metadados

### Cache de Documentação

- Download recursivo até profundidade especificada
- Processamento de recursos estáticos
- Ajuste automático de links relativos
- Suporte a redirecionamentos
- Metadados de download

### Sincronização

- Verificação de conectividade
- Atualização em lote de recursos
- Relatório detalhado de resultados
- Tratamento de falhas individuais

## Monitoramento

### Logs

- Logs de erro: `logs/error.log`
- Logs combinados: `logs/combined.log`
- Formato JSON com timestamps

### Metadados

Cada recurso inclui:
- URL de origem
- Timestamp da última atualização
- Tamanho do recurso
- Status de sincronização

## Troubleshooting

### Problemas de Conectividade

1. Verifique sua conexão com a internet
2. Confirme acesso ao GitHub/APIs
3. Verifique configurações de proxy

### Erros de Cache

1. Verifique espaço em disco
2. Confirme permissões de escrita
3. Limpe cache corrompido manualmente

### Problemas de Sincronização

1. Verifique logs de erro
2. Confirme URLs dos recursos
3. Tente sincronizar recursos individualmente

## Limitações

- Máximo de 1000 páginas por documentação
- Profundidade máxima recomendada: 3 níveis
- Cache local requer espaço em disco adequado

## Contribuindo

1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

## Licença

MIT