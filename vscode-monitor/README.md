# VSCode Monitor MCP Server

Servidor MCP para monitoramento e diagnóstico do VSCode, especialmente focado em problemas de integração do shell.

## Funcionalidades

- Captura automática de screenshots quando ocorrem erros de integração do shell
- Coleta detalhada de informações do sistema
- Análise da configuração do shell
- Sugestões de correção baseadas em diagnósticos
- Logging detalhado para troubleshooting

## Instalação

```bash
npm install
npm run build
```

## Configuração

O servidor não requer configuração adicional, mas certifique-se de que:
- O VSCode está atualizado
- Você tem permissões adequadas para captura de tela
- Há espaço em disco suficiente para logs e screenshots

## Uso

### Iniciar Monitoramento

```typescript
// Inicia o monitoramento com intervalo de 30 segundos
await handleStartMonitoring({ captureInterval: 30 });
```

### Parar Monitoramento

```typescript
await handleStopMonitoring();
```

### Obter Informações do Sistema

```typescript
await handleGetSystemInfo();
```

## Estrutura de Logs

Os logs são armazenados em dois arquivos:
- `logs/error.log`: Erros e problemas críticos
- `logs/combined.log`: Todos os eventos, incluindo informações de diagnóstico

## Diagnóstico de Problemas

O servidor analisa automaticamente:
- Compatibilidade do shell atual
- Configuração do shell padrão
- Permissões e existência do shell
- Estado dos processos do VSCode

### Exemplo de Output de Diagnóstico

```json
{
  "currentShell": {
    "name": "powershell.exe",
    "path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "isDefault": true,
    "isSupported": true
  },
  "issues": [],
  "recommendations": []
}
```

## Shells Suportados

- PowerShell
- PowerShell Core (pwsh)
- Bash (Git Bash, WSL)
- Zsh
- Fish
- CMD

## Troubleshooting

### Shell Integration Unavailable

Se você receber este erro:
1. Verifique se o shell está na lista de suportados
2. Confirme que o shell está corretamente instalado
3. Verifique as permissões do terminal
4. Considere reiniciar o VSCode

### Problemas de Captura de Tela

1. Verifique as permissões do aplicativo
2. Certifique-se de que há espaço em disco suficiente
3. Verifique se não há outro software bloqueando capturas de tela

## Contribuindo

1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença

MIT