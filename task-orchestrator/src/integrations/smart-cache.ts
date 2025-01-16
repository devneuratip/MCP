import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ISmartCacheIntegration } from './types.js';
import { BaseIntegration } from './base-integration.js';

interface CacheResponse {
  success: boolean;
  key: string;
  timestamp: string;
}

interface CacheGetResponse<T> {
  found: boolean;
  value: T | null;
  timestamp: string;
  ttl?: number;
}

interface CacheInvalidateResponse {
  success: boolean;
  pattern: string;
  keysRemoved: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  keys: string[];
}

export class SmartCacheIntegration extends BaseIntegration implements ISmartCacheIntegration {
  constructor(server: Server) {
    super(server);
  }

  async cacheResponse(key: string, data: unknown, ttl?: number): Promise<void> {
    try {
      const response = await this.makeRequest<CacheResponse>({
        method: 'set_cache',
        params: {
          key,
          value: this.serializeData(data),
          ttl
        }
      });

      if (!response || !response.success) {
        throw new Error(`Falha ao armazenar em cache: ${key}`);
      }
    } catch (error) {
      this.handleError(error, 'cacheResponse');
    }
  }

  async getCachedResponse<T>(key: string): Promise<T | null> {
    try {
      const response = await this.makeRequest<CacheGetResponse<T>>({
        method: 'get_cache',
        params: { key }
      });

      if (!response || !response.found) {
        return null;
      }

      return this.deserializeData<T>(response.value);
    } catch (error) {
      console.error('Erro ao recuperar do cache:', error);
      return null;
    }
  }

  async invalidateCache(pattern: string): Promise<void> {
    try {
      const response = await this.makeRequest<CacheInvalidateResponse>({
        method: 'invalidate_cache',
        params: { pattern }
      });

      if (!response || !response.success) {
        throw new Error(`Falha ao invalidar cache: ${pattern}`);
      }
    } catch (error) {
      this.handleError(error, 'invalidateCache');
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      const response = await this.makeRequest<CacheStats>({
        method: 'get_stats',
        params: {}
      });

      if (!response) {
        throw new Error('Falha ao obter estatísticas do cache');
      }

      return response;
    } catch (error) {
      console.error('Erro ao obter estatísticas do cache:', error);
      return {
        hits: 0,
        misses: 0,
        size: 0,
        keys: []
      };
    }
  }

  private serializeData(data: unknown): string {
    try {
      if (typeof data === 'string') {
        return data;
      }
      return JSON.stringify(data);
    } catch (error) {
      console.error('Erro ao serializar dados:', error);
      throw new Error('Falha ao serializar dados para cache');
    }
  }

  private deserializeData<T>(data: T | null): T | null {
    if (data === null) {
      return null;
    }

    try {
      if (typeof data === 'string') {
        return JSON.parse(data) as T;
      }
      return data;
    } catch (error) {
      console.error('Erro ao deserializar dados:', error);
      return null;
    }
  }

  async clearExpiredEntries(): Promise<void> {
    try {
      await this.makeRequest<void>({
        method: 'clear_expired',
        params: {}
      });
    } catch (error) {
      console.error('Erro ao limpar entradas expiradas:', error);
    }
  }

  async optimizeCache(): Promise<void> {
    try {
      const stats = await this.getCacheStats();
      if (stats.size > 1000 || stats.misses > stats.hits * 2) {
        await this.clearExpiredEntries();
      }
    } catch (error) {
      console.error('Erro ao otimizar cache:', error);
    }
  }
}