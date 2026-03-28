/**
 * @module provider-keys-routes
 * @description CRUD routes for AI provider API keys (super-admin only).
 * Prefix: /api/v1/customization/provider-keys
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { ProviderKeyStore } from '../services/provider-key-store.js';
import type { AiProvider } from '@etip/shared-utils';

const VALID_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

const SetKeySchema = z.object({
  provider: z.enum(VALID_PROVIDERS),
  apiKey: z.string().min(10).max(200),
});

const TestKeySchema = z.object({
  provider: z.enum(VALID_PROVIDERS),
  apiKey: z.string().min(10).max(200),
});

export interface ProviderKeyRouteDeps {
  providerKeyStore: ProviderKeyStore;
}

/** Extract super-admin role from request (x-user-role header or JWT payload) */
function requireSuperAdmin(req: FastifyRequest): string {
  const role = (req.headers['x-user-role'] as string) ?? '';
  const userId = (req.headers['x-user-id'] as string) ?? 'unknown';
  if (role !== 'super_admin') {
    throw new AppError(403, 'Super admin access required', 'FORBIDDEN');
  }
  return userId;
}

export function providerKeyRoutes(deps: ProviderKeyRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { providerKeyStore } = deps;

    /** GET / — List all provider key statuses */
    app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
      const keys = await providerKeyStore.getAllKeys();

      // Return all 3 providers (with null for unconfigured)
      const allProviders = VALID_PROVIDERS.map(p => {
        const existing = keys.find(k => k.provider === p);
        return existing ?? { provider: p, keyMasked: null, isValid: false, lastTested: null, updatedAt: null };
      });

      return reply.send({ data: allProviders });
    });

    /** GET /:provider — Get key status for one provider */
    app.get<{ Params: { provider: string } }>('/:provider', async (req, reply) => {
      const provider = req.params.provider as AiProvider;
      if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
        throw new AppError(400, `Invalid provider: ${provider}`, 'INVALID_PROVIDER');
      }

      const key = await providerKeyStore.getKey(provider);
      if (!key) {
        return reply.send({ data: { provider, keyMasked: null, isValid: false, lastTested: null } });
      }

      return reply.send({ data: key });
    });

    /** PUT / — Set (create/update) an API key */
    app.put('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = requireSuperAdmin(req);
      const body = SetKeySchema.parse(req.body);

      const result = await providerKeyStore.setKey({
        provider: body.provider,
        apiKey: body.apiKey,
        updatedBy: userId,
      });

      return reply.status(200).send({ data: result });
    });

    /** POST /test — Test connection with a key */
    app.post('/test', async (req: FastifyRequest, reply: FastifyReply) => {
      requireSuperAdmin(req);
      const body = TestKeySchema.parse(req.body);

      const result = await providerKeyStore.testConnection(body.provider, body.apiKey);
      return reply.send({ data: result });
    });

    /** DELETE /:provider — Remove a provider key */
    app.delete<{ Params: { provider: string } }>('/:provider', async (req, reply) => {
      requireSuperAdmin(req);
      const provider = req.params.provider as AiProvider;

      if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
        throw new AppError(400, `Invalid provider: ${provider}`, 'INVALID_PROVIDER');
      }

      const removed = await providerKeyStore.removeKey(provider);
      if (!removed) {
        throw new AppError(404, `No key found for provider: ${provider}`, 'NOT_FOUND');
      }

      return reply.status(204).send();
    });
  };
}
