import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RiskWeightStore } from '../services/risk-weight-store.js';
import {
  SetWeightSchema,
  IocTypeParamSchema,
  ApplyPresetSchema,
} from '../schemas/customization.js';

export interface RiskWeightRouteDeps {
  riskWeightStore: RiskWeightStore;
}

export function riskWeightRoutes(deps: RiskWeightRouteDeps) {
  const { riskWeightStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /risk/profiles — List all weight profiles. */
    app.get('/profiles', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const profiles = riskWeightStore.listProfiles(tenantId);
      return reply.send({ data: profiles, total: profiles.length });
    });

    /** GET /risk/presets — List available weight presets. */
    app.get('/presets', async (_req: FastifyRequest, reply: FastifyReply) => {
      const presets = riskWeightStore.listPresets();
      return reply.send({ data: presets });
    });

    /** POST /risk/presets/apply — Apply a preset to all IOC types. */
    app.post('/presets/apply', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const { preset } = ApplyPresetSchema.parse(req.body);
      const profiles = riskWeightStore.applyPreset(tenantId, preset, userId);
      return reply.send({ data: profiles });
    });

    /** POST /risk/validate — Validate weight configuration. */
    app.post('/validate', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as Record<string, unknown>;
      const weights = body.weights as Record<string, number>;
      const result = riskWeightStore.validateWeights(weights ?? {});
      return reply.send({ data: result });
    });

    /** GET /risk/profiles/:type — Get weight profile for IOC type. */
    app.get('/profiles/:type', async (req: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { type } = IocTypeParamSchema.parse(req.params);
      const profile = riskWeightStore.getProfile(tenantId, type);
      return reply.send({ data: profile });
    });

    /** PUT /risk/profiles/:type — Update weights for IOC type. */
    app.put('/profiles/:type', async (req: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const { type } = IocTypeParamSchema.parse(req.params);
      const input = SetWeightSchema.parse(req.body);
      const profile = riskWeightStore.setProfile(tenantId, type, input, userId);
      return reply.send({ data: profile });
    });
  };
}
