/**
 * @module routes/public
 * @description Barrel for all public API routes.
 * Registers under /api/v1/public with API key auth + plan-based rate limiting.
 */
import type { FastifyInstance } from 'fastify';
import { registerPublicRateLimit } from '../../plugins/public-rate-limit.js';
import { publicIocRoutes } from './iocs.js';
import { publicFeedRoutes } from './feeds.js';
import { publicExportRoutes } from './export.js';
import { publicUsageRoutes } from './usage.js';
import { publicWebhookRoutes } from './webhooks.js';

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // Register scoped rate limit for all public routes
  await registerPublicRateLimit(app);

  // Register sub-routes (all under the /api/v1/public prefix set by parent)
  await app.register(publicIocRoutes);
  await app.register(publicExportRoutes);
  await app.register(publicFeedRoutes);
  await app.register(publicUsageRoutes);
  await app.register(publicWebhookRoutes);
}
