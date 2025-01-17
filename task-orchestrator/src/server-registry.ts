import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  IServerConnection,
  ServerStatus,
  IHealthCheck,
  HealthStatus,
  McpResponse,
  McpToolsResponse,
  McpResourcesResponse,
  McpRequestSchema
} from './types.js';

export class ServerRegistry {
  private servers: Map<string, IServerConnection>;
  private healthCheckInterval: NodeJS.Timeout | null;

  constructor() {
    this.servers = new Map();
    this.healthCheckInterval = null;
  }

  public async registerServer(name: string, server: Server): Promise<IServerConnection> {
    const connection: IServerConnection = {
      id: `${name}-${Date.now()}`,
      name,
      server,
      status: ServerStatus.CONNECTED,
      capabilities: [],
      lastHealthCheck: new Date()
    };

    try {
      const capabilities = await this.fetchServerCapabilities(server);
      connection.capabilities = capabilities;
      
      this.servers.set(connection.id, connection);
      await this.startHealthCheck();
      
      return connection;
    } catch (error: unknown) {
      connection.status = ServerStatus.ERROR;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new Error(`Falha ao registrar servidor ${name}: ${errorMessage}`);
    }
  }

  public async unregisterServer(id: string): Promise<void> {
    const connection = this.servers.get(id);
    if (!connection) {
      throw new Error(`Servidor não encontrado: ${id}`);
    }

    connection.status = ServerStatus.DISCONNECTED;
    this.servers.delete(id);

    if (this.servers.size === 0) {
      this.stopHealthCheck();
    }
  }

  public getServer(id: string): IServerConnection | undefined {
    return this.servers.get(id);
  }

  public getAllServers(): IServerConnection[] {
    return Array.from(this.servers.values());
  }

  public getServersByCapability(capability: string): IServerConnection[] {
    // Procura por capabilities com e sem o prefixo "tool:"
    const searchCapabilities = [
      capability,
      `tool:${capability}`,
      capability.replace('tool:', '')
    ];

    return Array.from(this.servers.values())
      .filter(server => 
        server.capabilities.some(cap => 
          searchCapabilities.includes(cap)
        )
      );
  }

  private async fetchServerCapabilities(server: Server): Promise<string[]> {
    const capabilities: string[] = [];

    try {
      const toolsResponse = await this.makeRequest<McpToolsResponse>(server, 'listTools');
      if (toolsResponse?.tools) {
        toolsResponse.tools.forEach(tool => {
          // Adiciona tanto com prefixo quanto sem
          capabilities.push(`tool:${tool.name}`);
          capabilities.push(tool.name);
        });
      }
    } catch (error) {
      if (!(error instanceof McpError && error.code === ErrorCode.MethodNotFound)) {
        console.error('Erro ao listar ferramentas:', error);
      }
    }

    try {
      const resourcesResponse = await this.makeRequest<McpResourcesResponse>(server, 'listResources');
      if (resourcesResponse?.resources) {
        resourcesResponse.resources.forEach(resource => {
          capabilities.push(`resource:${resource.uri}`);
        });
      }
    } catch (error) {
      if (!(error instanceof McpError && error.code === ErrorCode.MethodNotFound)) {
        console.error('Erro ao listar recursos:', error);
      }
    }

    return capabilities;
  }

  private async makeRequest<T>(server: Server, method: string): Promise<T | null> {
    try {
      const schema: McpRequestSchema = {
        method,
        params: { _meta: {} }
      };

      const response = await (server as any).request(schema, schema) as McpResponse;

      if (response?.content?.[0]?.text) {
        return JSON.parse(response.content[0].text) as T;
      }
      return null;
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        return null;
      }
      throw error;
    }
  }

  private async checkServerHealth(connection: IServerConnection): Promise<IHealthCheck> {
    try {
      const healthCheck: IHealthCheck = {
        status: HealthStatus.HEALTHY,
        timestamp: new Date(),
        details: {
          cpu: 0,
          memory: 0,
          activeConnections: 0
        }
      };

      connection.status = ServerStatus.CONNECTED;
      connection.lastHealthCheck = healthCheck.timestamp;

      return healthCheck;
    } catch (error) {
      console.error(`Erro no health check para ${connection.name}:`, error);
      connection.status = ServerStatus.ERROR;
      
      return {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date(),
        details: {
          cpu: 0,
          memory: 0,
          activeConnections: 0
        }
      };
    }
  }

  private async startHealthCheck(): Promise<void> {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const connection of this.servers.values()) {
        await this.checkServerHealth(connection);
      }
    }, 30000) as NodeJS.Timeout;
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}