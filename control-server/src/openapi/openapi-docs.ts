import type { FastifyInstance } from 'fastify';

/**
 * Serve OpenAPI 3.0 specification for the public API.
 */
export async function openApiDocsRoutes(app: FastifyInstance) {
  app.get('/api/v2/openapi.json', async (_req, reply) => {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'PhoneFarm Open API',
        version: '2.0.0',
        description: 'PhoneFarm SaaS platform public REST API for device management, task orchestration, and AI vision automation.',
        contact: { email: 'support@phonefarm.io' },
      },
      servers: [
        { url: 'https://phone.openedskill.com/api/v2/open', description: 'Production' },
        { url: 'http://localhost:8443/api/v2/open', description: 'Local Development' },
      ],
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API Key obtained from the PhoneFarm portal (账户中心 → API Keys).',
          },
        },
        schemas: {
          Device: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              model: { type: 'string' },
              androidVersion: { type: 'string' },
              status: { type: 'string', enum: ['online', 'offline'] },
              lastSeen: { type: 'string', format: 'date-time' },
            },
          },
          Task: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              deviceId: { type: 'string' },
              status: { type: 'string' },
              config: { type: 'object' },
              cronExpr: { type: 'string' },
            },
          },
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
      paths: {
        '/devices/register': {
          post: {
            summary: 'Register a device',
            operationId: 'registerDevice',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['deviceId'],
                    properties: {
                      deviceId: { type: 'string' },
                      name: { type: 'string' },
                      model: { type: 'string' },
                      androidVersion: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Device registered' },
              '400': { description: 'Bad request' },
            },
          },
        },
        '/devices': {
          get: {
            summary: 'List devices',
            operationId: 'listDevices',
            responses: {
              '200': {
                description: 'Device list',
                content: { 'application/json': { schema: { type: 'object', properties: { devices: { type: 'array', items: { $ref: '#/components/schemas/Device' } } } } } },
              },
            },
          },
        },
        '/devices/{id}': {
          get: {
            summary: 'Get device by ID',
            operationId: 'getDevice',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'Device detail' }, '404': { description: 'Not found' } },
          },
        },
        '/devices/{id}/command': {
          post: {
            summary: 'Send command to device',
            operationId: 'sendCommand',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['action'],
                    properties: {
                      action: { type: 'string' },
                      params: { type: 'object' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'Command sent' } },
          },
        },
        '/tasks': {
          get: {
            summary: 'List tasks',
            operationId: 'listTasks',
            responses: { '200': { description: 'Task list' } },
          },
          post: {
            summary: 'Create task',
            operationId: 'createTask',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                      name: { type: 'string' },
                      deviceId: { type: 'string' },
                      config: { type: 'object' },
                      cronExpr: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'Task created' } },
          },
        },
        '/vlm/execute': {
          post: {
            summary: 'Execute VLM AI task',
            operationId: 'executeVlm',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['deviceId', 'task'],
                    properties: {
                      deviceId: { type: 'string' },
                      task: { type: 'string' },
                      modelName: { type: 'string' },
                      maxSteps: { type: 'integer' },
                    },
                  },
                },
              },
            },
            responses: { '202': { description: 'Task queued' } },
          },
        },
        '/usage': {
          get: {
            summary: 'Get API usage',
            operationId: 'getUsage',
            parameters: [
              { name: 'from', in: 'query', schema: { type: 'integer' }, description: 'Start timestamp (ms)' },
            ],
            responses: { '200': { description: 'Usage data' } },
          },
        },
      },
      tags: [
        { name: 'Devices', description: 'Device management endpoints' },
        { name: 'Tasks', description: 'Task orchestration endpoints' },
        { name: 'VLM', description: 'AI vision task execution' },
        { name: 'Usage', description: 'Usage and billing endpoints' },
      ],
    };

    return reply.header('Access-Control-Allow-Origin', '*').send(spec);
  });
}
