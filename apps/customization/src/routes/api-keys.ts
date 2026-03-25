import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AiModelStore } from '../services/ai-model-store.js';

export interface ApiKeyRouteDeps {
  aiModelStore: AiModelStore;
}

const SaveApiKeySchema = z.object({
  apiKey: z.string().min(1).refine(
    (v) => v.startsWith('sk-ant-'),
    { message: 'Anthropic API keys must start with "sk-ant-"' },
  ),
});

export function apiKeyRoutes(deps: ApiKeyRouteDeps) {
  const { aiModelStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /api-keys/anthropic — BYOK key status for tenant (never returns the raw key). */
    app.get('/anthropic', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      return reply.send({ data: aiModelStore.getAnthropicKeyStatus(tenantId) });
    });

    /** PUT /api-keys/anthropic — Store tenant Anthropic API key. Body: { apiKey: string }. */
    app.put('/anthropic', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const result = SaveApiKeySchema.safeParse(req.body);
      if (!result.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: result.error.errors[0]?.message ?? 'Invalid API key' },
        });
      }
      return reply.send({ data: aiModelStore.setAnthropicKey(tenantId, result.data.apiKey) });
    });

    /** DELETE /api-keys/anthropic — Remove tenant Anthropic API key. */
    app.delete('/anthropic', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      return reply.send({ data: aiModelStore.deleteAnthropicKey(tenantId) });
    });
  };
}
