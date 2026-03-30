/**
 * @module access-review routes
 * @description I-17 Access Review Automation — admin + tenant endpoints.
 *   GET  /admin/access-reviews           — super_admin: list all reviews
 *   PUT  /admin/access-reviews/:reviewId — super_admin: confirm/disable
 *   GET  /admin/access-reviews/quarterly — super_admin: platform-wide summary
 *   GET  /settings/access-reviews           — tenant_admin: own org reviews
 *   PUT  /settings/access-reviews/:reviewId — tenant_admin: confirm/disable own org
 *   GET  /settings/access-reviews/quarterly — tenant_admin: own org summary
 */
import type { FastifyInstance } from 'fastify';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import {
  AccessReviewQuerySchema,
  AccessReviewActionSchema,
} from '@etip/shared-types';

export async function accessReviewRoutes(app: FastifyInstance) {
  const { AccessReviewService } = await import('@etip/user-service');
  const svc = new AccessReviewService();

  // ── Super Admin Routes ──────────────────────────────────────────

  /** GET /admin/access-reviews — list all pending/completed reviews */
  app.get('/admin/access-reviews', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const filters = AccessReviewQuerySchema.parse(req.query);
    const result = await svc.listReviews(filters);
    return { status: 'ok', ...result };
  });

  /** PUT /admin/access-reviews/:reviewId — confirm or disable */
  app.put<{ Params: { reviewId: string } }>('/admin/access-reviews/:reviewId', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const { reviewId } = req.params;
    const user = getUser(req);
    const input = AccessReviewActionSchema.parse(req.body);
    const result = await svc.actOnReview(reviewId, user.sub, input);
    return { status: 'ok', data: result };
  });

  /** GET /admin/access-reviews/quarterly — platform-wide quarterly summary */
  app.get('/admin/access-reviews/quarterly', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const { tenantId } = req.query as { tenantId?: string };
    if (!tenantId) {
      return { status: 'ok', data: [], message: 'Pass ?tenantId=uuid for tenant-specific summary' };
    }
    const summary = await svc.generateQuarterlyReview(tenantId);
    return { status: 'ok', data: summary };
  });

  // ── Tenant Admin Routes ─────────────────────────────────────────

  /** GET /settings/access-reviews — own org stale users */
  app.get('/settings/access-reviews', {
    preHandler: [authenticate, rbac('org:read')],
  }, async (req) => {
    const user = getUser(req);
    const filters = AccessReviewQuerySchema.parse(req.query);
    const result = await svc.listReviews(filters, user.tenantId);
    return { status: 'ok', ...result };
  });

  /** PUT /settings/access-reviews/:reviewId — confirm or disable own org */
  app.put<{ Params: { reviewId: string } }>('/settings/access-reviews/:reviewId', {
    preHandler: [authenticate, rbac('org:update')],
  }, async (req) => {
    const { reviewId } = req.params;
    const user = getUser(req);
    const input = AccessReviewActionSchema.parse(req.body);
    const result = await svc.actOnTenantReview(reviewId, user.sub, user.tenantId, input);
    return { status: 'ok', data: result };
  });

  /** GET /settings/access-reviews/quarterly — own org quarterly summary */
  app.get('/settings/access-reviews/quarterly', {
    preHandler: [authenticate, rbac('org:read')],
  }, async (req) => {
    const user = getUser(req);
    const summary = await svc.generateQuarterlyReview(user.tenantId);
    return { status: 'ok', data: summary };
  });
}
