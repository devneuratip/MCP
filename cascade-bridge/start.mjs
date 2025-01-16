import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

// Obtém o diretório atual do módulo ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configurações
const BRIDGE_DIR = resolve(__dirname);
const BUILD_DIR = join(BRIDGE_DIR, 'build');

try {
  console.log('🔄 Iniciando processo de inicialização...');

  // Limpa diretório de build
  console.log('🧹 Limpando diretório de build...');
  execSync(`rimraf "${BUILD_DIR}"`, { stdio: 'inherit' });

  // Compila o projeto
  console.log('🔨 Compilando projeto...');
  execSync('npm run build', { stdio: 'inherit', cwd: BRIDGE_DIR });

  // Inicia o servidor com flags adicionais
  console.log('🚀 Iniciando servidor...');
  execSync('node --trace-warnings --unhandled-rejections=strict build/index.js', {
    stdio: 'inherit',
    cwd: BRIDGE_DIR,
    env: {
      ...process.env,
      DEBUG: 'socket.io:*',  // Habilita debug do socket.io
      NODE_ENV: 'development'
    }
  });
} catch (error) {
  console.error('❌ Erro durante inicialização:', error);
  process.exit(1);
}