# Content Manager MCP Server

Servidor MCP para gerenciamento e geração de conteúdo e mídia.

## Instalação Básica

```bash
npm install
npm run build
```

## Funcionalidades Opcionais

O Content Manager suporta várias funcionalidades opcionais que requerem dependências adicionais. Instale apenas as dependências necessárias para as funcionalidades que você precisa:

### Processamento de Imagem
```bash
npm install sharp canvas node-html-to-image
```

### Processamento de Documentos
```bash
npm install pdf-lib docx mammoth epub-gen
```

### Processamento de Mídia
```bash
npm install @ffmpeg/ffmpeg @ffmpeg/core fluent-ffmpeg
```

### Serviços Google Cloud
```bash
npm install @google-cloud/text-to-speech @google-cloud/vision @google-cloud/translate
```

### Automação Web
```bash
npm install puppeteer playwright cheerio
```

### Processamento de Texto
```bash
npm install langchain unified remark rehype
```

## Notas de Instalação

- Algumas dependências podem requerer Python ou outras ferramentas de build
- Em caso de problemas com dependências nativas, tente instalar apenas as funcionalidades que você realmente precisa
- Para ambientes de produção, recomendamos usar Docker para garantir a compatibilidade de todas as dependências