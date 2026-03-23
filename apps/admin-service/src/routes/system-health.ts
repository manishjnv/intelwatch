import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { HealthStore } from '../services/health-store.js';
import { getDependencyMap } from '../services/health-store.js';

export interface SystemHealthRouteDeps {
  healthStore: HealthStore;
}

/** System health monitoring routes (P0 core feature 1 + P0 #6 dependency map). */
export function systemHealthRoutes(deps: SystemHealthRouteDeps) {
  const { healthStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /system/health — full health dashboard. */
    app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
      const health = healthStore.getSystemHealth();
      return reply.send({ data: health });
    });

    /** GET /system/services — list all service entries. */
    app.get('/services', async (_req: FastifyRequest, reply: FastifyReply) => {
      const services = healthStore.getServiceList();
      return reply.send({ data: services });
    });

    /** GET /system/metrics — current system metrics snapshot. */
    app.get('/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
      const metrics = healthStore.getMetrics();
      return reply.send({ data: metrics });
    });

    /** GET /system/dependency-map — P0 #6: service/infra dependency visualization. */
    app.get('/dependency-map', async (_req: FastifyRequest, reply: FastifyReply) => {
      const map = getDependencyMap();
      return reply.send({ data: map });
    });
  };
}
