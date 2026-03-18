---
name: etip-service-pattern
description: Apply when creating or modifying any ETIP microservice in /apps/
---

# ETIP Service Pattern

When working on any service in /apps/:

## File Structure (every service)
```
apps/{service}/
├── src/
│   ├── index.ts          # Fastify server bootstrap
│   ├── routes/
│   │   ├── index.ts      # Barrel export for all routes
│   │   ├── health.ts     # GET /health (required)
│   │   └── {entity}.ts   # Entity-specific routes
│   ├── services/
│   │   └── {entity}.service.ts  # Business logic
│   ├── schemas/
│   │   └── {entity}.schema.ts   # Zod validation schemas
│   └── middleware/        # Service-specific middleware
├── __tests__/
│   ├── health.test.ts
│   └── {entity}.test.ts
├── package.json           # @etip/{service-name}
├── tsconfig.json          # composite: true
├── CLAUDE.md              # Module-specific rules
└── README.md
```

## Fastify Server Bootstrap (index.ts)
```typescript
import Fastify from 'fastify';
import { registerRoutes } from './routes';

const server = Fastify({
  logger: { level: process.env.TI_LOG_LEVEL || 'info' },
});

await registerRoutes(server);

const port = parseInt(process.env.TI_{SERVICE}_PORT || '300X');
await server.listen({ port, host: '0.0.0.0' });
```

## Route Pattern
```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate, rbac } from '@etip/shared-auth';

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [authenticate, rbac('entity:read')],
    handler: async (req, reply) => {
      // Zod-validated query params
      // Service call
      // Standard response shape: { data, total, page, limit }
    }
  });
};
export default routes;
```

## Mandatory for every route:
- Zod schema validation on inputs
- authenticate middleware (except /health)
- rbac() permission check
- AppError for errors (never throw Error())
- Audit log for all mutations

## Standard Response Shapes
```typescript
// List:   { data: T[], total: number, page: number, limit: number }
// Single: { data: T }
// Created: { data: T } with status 201
// No content: status 204
// Error: { error: { code: string, message: string, details?: unknown } }
```

## Health Endpoint (required)
```typescript
fastify.get('/health', async () => ({
  status: 'ok',
  service: '{service-name}',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));
```

## Package.json
```json
{
  "name": "@etip/{service-name}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@etip/shared-types": "workspace:*",
    "@etip/shared-utils": "workspace:*",
    "@etip/shared-auth": "workspace:*"
  }
}
```

## tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/shared-utils" },
    { "path": "../../packages/shared-auth" }
  ],
  "include": ["src"]
}
```
