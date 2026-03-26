/**
 * Feed Quota Repository — thin Prisma wrapper for tenant plan assignments.
 *
 * Follows the billing-service dual-mode pattern:
 * store → repo (Prisma) with in-memory fallback on failure.
 */

import type { PrismaClient } from '@prisma/client';
import type { TenantPlanAssignment, BillingPlanId } from './services/feed-quota-store.js';

export class FeedQuotaRepo {
  constructor(private readonly db: PrismaClient) {}

  async getTenantPlan(tenantId: string): Promise<TenantPlanAssignment | null> {
    const row = await this.db.feedQuotaPlanAssignment.findUnique({
      where: { tenantId },
    });
    if (!row) return null;
    return this.toAssignment(row);
  }

  async upsertTenantPlan(assignment: TenantPlanAssignment): Promise<TenantPlanAssignment> {
    const row = await this.db.feedQuotaPlanAssignment.upsert({
      where: { tenantId: assignment.tenantId },
      create: {
        tenantId: assignment.tenantId,
        planId: assignment.planId,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt,
      },
      update: {
        planId: assignment.planId,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt,
      },
    });
    return this.toAssignment(row);
  }

  async getAllAssignments(): Promise<TenantPlanAssignment[]> {
    const rows = await this.db.feedQuotaPlanAssignment.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => this.toAssignment(r));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toAssignment(row: any): TenantPlanAssignment {
    return {
      tenantId: row.tenantId,
      planId: row.planId as BillingPlanId,
      assignedBy: row.assignedBy,
      assignedAt: row.assignedAt,
    };
  }
}
