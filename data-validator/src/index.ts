#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import Ajv from 'ajv';

const ajv = new Ajv();

interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: any[];
}

class DataValidatorServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'data-validator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'validate_schema',
          description: 'Validate data against a JSON schema using Ajv',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'object',
                description: 'JSON Schema definition'
              },
              data: {
                type: 'object',
                description: 'Data to validate'
              }
            },
            required: ['schema', 'data']
          }
        },
        {
          name: 'validate_type',
          description: 'Validate data against a Zod type definition',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Zod type definition as string'
              },
              data: {
                type: 'any',
                description: 'Data to validate'
              }
            },
            required: ['type', 'data']
          }
        },
        {
          name: 'validate_array',
          description: 'Validate each item in an array against a schema',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'object',
                description: 'JSON Schema for array items'
              },
              array: {
                type: 'array',
                description: 'Array of items to validate'
              }
            },
            required: ['schema', 'array']
          }
        },
        {
          name: 'validate_nested',
          description: 'Validate nested object structures with path support',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'object',
                description: 'JSON Schema for validation'
              },
              data: {
                type: 'object',
                description: 'Nested object to validate'
              },
              path: {
                type: 'string',
                description: 'Dot notation path to validate (optional)'
              }
            },
            required: ['schema', 'data']
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'validate_schema':
          return this.handleValidateSchema(request.params.arguments);
        case 'validate_type':
          return this.handleValidateType(request.params.arguments);
        case 'validate_array':
          return this.handleValidateArray(request.params.arguments);
        case 'validate_nested':
          return this.handleValidateNested(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private handleValidateSchema(args: any): { content: Array<{ type: string; text: string }> } {
    try {
      const validate = ajv.compile(args.schema);
      const isValid = validate(args.data);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              isValid,
              errors: validate.errors || null
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private handleValidateType(args: any): { content: Array<{ type: string; text: string }> } {
    try {
      const schema = eval(`z.${args.type}`);
      const result = schema.safeParse(args.data);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              ...(result.success 
                ? { data: result.data }
                : { errors: result.error.issues }
              )
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Type validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private handleValidateArray(args: any): { content: Array<{ type: string; text: string }> } {
    try {
      const validate = ajv.compile(args.schema);
      const results = args.array.map((item: any, index: number) => {
        const isValid = validate(item);
        return {
          index,
          isValid,
          errors: validate.errors || null
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              totalItems: args.array.length,
              validItems: results.filter((r: any) => r.isValid).length,
              results
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Array validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private handleValidateNested(args: any): { content: Array<{ type: string; text: string }> } {
    try {
      const validate = ajv.compile(args.schema);
      let dataToValidate = args.data;

      if (args.path) {
        dataToValidate = args.path.split('.').reduce((obj: any, key: string) => {
          return obj?.[key];
        }, args.data);

        if (dataToValidate === undefined) {
          throw new Error(`Path "${args.path}" not found in data`);
        }
      }

      const isValid = validate(dataToValidate);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              path: args.path || 'root',
              isValid,
              errors: validate.errors || null
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Nested validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Data Validator MCP server running on stdio');
  }
}

const server = new DataValidatorServer();
server.run().catch(console.error);