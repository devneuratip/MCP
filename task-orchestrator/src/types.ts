import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export enum ServerStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

export interface IServerConnection {
  id: string;
  name: string;
  server: Server;
  status: ServerStatus;
  capabilities: string[];
  lastHealthCheck: Date;
}

export interface IHealthCheck {
  status: HealthStatus;
  timestamp: Date;
  details: {
    cpu: number;
    memory: number;
    activeConnections: number;
  };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name?: string;
  mimeType?: string;
}

export interface McpContentItem {
  type: string;
  text: string;
}

export interface McpResponse {
  content: McpContentItem[];
}

export interface McpToolsResponse {
  tools: McpTool[];
}

export interface McpResourcesResponse {
  resources: McpResource[];
}

export interface McpRequest {
  method: string;
  params: Record<string, unknown>;
}

export interface McpRequestSchema {
  method: string;
  params: {
    _meta: Record<string, unknown>;
  };
}

export interface McpServerInfo {
  id: string;
  name: string;
  status: ServerStatus;
  capabilities: string[];
  lastHealthCheck: Date;
}

export interface McpServerResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface McpServerCapabilities {
  tools: McpTool[];
  resources: McpResource[];
}

export interface McpServerConfig {
  name: string;
  version: string;
  capabilities?: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
  };
}

export interface McpServerOptions {
  transport?: any;
  logger?: any;
}

export interface McpServerError extends Error {
  code: string;
  data?: unknown;
}