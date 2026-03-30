/**
 * @module access-review-repository
 * @description Prisma CRUD for AccessReview model (I-17).
 */
import { prisma } from './prisma.js';

// ── Create ──────────────────────────────────────────────────────────

/** Create a new access review record. */
export async function createAccessReview(data: {
  userId: string;
  tenantId: string;
  reviewType: string;
  action?: string;
}) {
  return prisma.accessReview.create({
    data: {
      userId: data.userId,
      tenantId: data.tenantId,
      reviewType: data.reviewType,
      action: data.action ?? 'pending',
    },
  });
}

// ── Read ────────────────────────────────────────────────────────────

/** Find an access review by ID. */
export async function findAccessReviewById(id: string) {
  return prisma.accessReview.findUnique({ where: { id } });
}

/** List access reviews with optional filters, paginated. */
export async function listAccessReviews(filters: {
  tenantId?: string;
  reviewType?: string;
  action?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.reviewType) where.reviewType = filters.reviewType;
  if (filters.action) where.action = filters.action;

  const [data, total] = await Promise.all([
    prisma.accessReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.accessReview.count({ where }),
  ]);

  return { data, total, page: filters.page, limit: filters.limit };
}

/** Find pending reviews older than a cutoff date (for auto-disable). */
export async function findPendingReviewsOlderThan(cutoffDate: Date) {
  return prisma.accessReview.findMany({
    where: {
      action: 'pending',
      reviewType: 'stale_super_admin',
      createdAt: { lt: cutoffDate },
    },
  });
}

// ── Update ──────────────────────────────────────────────────────────

/** Update an access review (confirm, disable, auto-disable). */
export async function updateAccessReview(id: string, data: {
  action?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  notes?: string;
  autoDisabled?: boolean;
}) {
  return prisma.accessReview.update({ where: { id }, data });
}
