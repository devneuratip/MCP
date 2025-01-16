import net from 'net';
import winston from 'winston';

// Configuração do logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'connection-check-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'connection-check.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export async function checkWebSocketAvailability(host: string, port: number, timeout: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    // Define timeout
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      logger.info(`Porta ${port} está disponível`);
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      logger.warn(`Timeout ao tentar conectar na porta ${port}`);
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (error) => {
      logger.debug(`Porta ${port} não está disponível:`, error.message);
      socket.destroy();
      resolve(false);
    });

    logger.debug(`Verificando disponibilidade da porta ${port}...`);
    socket.connect(port, host);
  });
}

export async function waitForWebSocket(host: string, port: number, maxAttempts: number = 1): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const available = await checkWebSocketAvailability(host, port);
    if (available) {
      return true;
    }
    if (attempt < maxAttempts - 1) {
      logger.debug(`Tentativa ${attempt + 1}/${maxAttempts} falhou, tentando novamente...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}