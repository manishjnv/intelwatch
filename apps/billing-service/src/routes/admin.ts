import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { InvoiceStore } from '../services/invoice-store.js';
import type { PlanStore } from '../services/plan-store.js';
import type { UsageStore } from '../services/usage-store.js';
import { PLAN_DEFINITIONS } from '../services/plan-store.js';
import type { PlanId } from '../schemas/billing.js';

export interface AdminRouteDeps {
  invoiceStore: InvoiceStore;
  planStore: PlanStore;
  usageStore: UsageStore;
}

/**
 * P0 #9: Billing admin dashboard routes.
 * Provides revenue, MRR, churn, and plan distribution metrics for admins.
 */
export function adminRoutes(deps: AdminRouteDeps) {
  const { invoiceStore, planStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /**
     * GET /admin/dashboard — billing overview for admin.
     * Returns: totalRevenue, MRR estimate, activeSubscriptions, planDistribution, churnIndicators.
     */
    app.get('/dashboard', async (_req: FastifyRequest, reply: FastifyReply) => {
      const revenue = invoiceStore.getRevenueMetrics();
      const allTenants = planStore.getAllTenantPlans();

      // Plan distribution
      const planDistribution: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 };
      let activeSubscriptions = 0;
      let cancelledSubscriptions = 0;

      for (const tenant of allTenants) {
        planDistribution[tenant.planId] = (planDistribution[tenant.planId] ?? 0) + 1;
        if (tenant.status === 'active' && tenant.planId !== 'free') activeSubscriptions++;
        if (tenant.status === 'cancelled') cancelledSubscriptions++;
      }

      // MRR estimate: sum of monthly prices for all active paid tenants
      let mrrInr = 0;
      for (const tenant of allTenants) {
        if (tenant.status === 'active' && tenant.planId !== 'free') {
          const planDef = PLAN_DEFINITIONS[tenant.planId as PlanId];
          mrrInr += planDef?.priceInr ?? 0;
        }
      }

      // Churn rate estimate (cancelled / total non-free as %)
      const totalPaid = allTenants.filter((t) => t.planId !== 'free').length;
      const churnRate = totalPaid > 0 ? Math.round((cancelledSubscriptions / totalPaid) * 100) : 0;

      return reply.send({
        data: {
          totalRevenueInr: revenue.totalRevenueInr,
          mrrInr,
          activeSubscriptions,
          cancelledSubscriptions,
          churnRate,
          paidInvoiceCount: revenue.paidInvoiceCount,
          pendingInvoiceCount: revenue.pendingInvoiceCount,
          planDistribution,
          totalTenants: allTenants.length,
          generatedAt: new Date().toISOString(),
        },
      });
    });
  };
}
