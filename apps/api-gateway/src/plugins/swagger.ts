/**
 * @module plugins/swagger
 * @description OpenAPI 3.0 documentation via @fastify/swagger + Swagger UI.
 * Must be registered BEFORE route handlers so that route schemas are captured.
 */
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ETIP Public API',
        description:
          'Enterprise Threat Intelligence Platform — public REST API for IOC consumption, feed browsing, webhook subscriptions, and key management.',
        version: '1.0.0',
        contact: { name: 'IntelWatch', url: 'https://ti.intelwatch.in' },
      },
      servers: [
        { url: '/api/v1/public', description: 'Public API (relative)' },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key prefixed with `etip_`. Obtain from Command Center → API Keys.',
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
      tags: [
        { name: 'IOCs', description: 'Indicator of Compromise endpoints' },
        { name: 'Feeds', description: 'Feed and article browsing' },
        { name: 'Stats', description: 'Aggregate IOC statistics' },
        { name: 'Usage', description: 'Plan quota and usage info' },
        { name: 'Webhooks', description: 'Webhook subscription management' },
        { name: 'API Keys', description: 'Key rotation and management' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/v1/public/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
  });
}
