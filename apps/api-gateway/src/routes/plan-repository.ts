/**
 * @module api-gateway/routes/plan-repository
 * @description Database access for SubscriptionPlanDefinition + PlanFeatureLimit.
 */
import { prisma } from '../prisma.js';
import type { PlanDefinitionCreate, PlanDefinitionUpdate } from '@etip/shared-types';

const FEATURES_INCLUDE = { features: { orderBy: { featureKey: 'asc' as const } } };

export async function findAllPlans() {
  return prisma.subscriptionPlanDefinition.findMany({
    include: FEATURES_INCLUDE,
    orderBy: { sortOrder: 'asc' },
  });
}

export async function findPlanByPlanId(planId: string) {
  return prisma.subscriptionPlanDefinition.findUnique({
    where: { planId },
    include: FEATURES_INCLUDE,
  });
}

export async function createPlan(data: PlanDefinitionCreate, createdBy: string) {
  return prisma.subscriptionPlanDefinition.create({
    data: {
      planId: data.planId,
      name: data.name,
      description: data.description ?? null,
      priceMonthlyInr: data.priceMonthlyInr,
      priceAnnualInr: data.priceAnnualInr,
      isPublic: data.isPublic,
      isDefault: data.isDefault,
      sortOrder: data.sortOrder,
      createdBy,
      features: {
        create: data.features.map((f) => ({
          featureKey: f.featureKey,
          enabled: f.enabled,
          limitDaily: f.limitDaily,
          limitWeekly: f.limitWeekly,
          limitMonthly: f.limitMonthly,
          limitTotal: f.limitTotal,
        })),
      },
    },
    include: FEATURES_INCLUDE,
  });
}

export async function updatePlan(planId: string, data: PlanDefinitionUpdate) {
  const existing = await prisma.subscriptionPlanDefinition.findUnique({ where: { planId } });
  if (!existing) return null;

  // Update plan fields
  await prisma.subscriptionPlanDefinition.update({
    where: { planId },
    data: {
      name: data.name,
      description: data.description,
      priceMonthlyInr: data.priceMonthlyInr,
      priceAnnualInr: data.priceAnnualInr,
      isPublic: data.isPublic,
      isDefault: data.isDefault,
      sortOrder: data.sortOrder,
    },
  });

  // If features provided, replace all features atomically
  if (data.features) {
    await prisma.$transaction([
      prisma.planFeatureLimit.deleteMany({ where: { planDefId: existing.id } }),
      ...data.features.map((f) =>
        prisma.planFeatureLimit.create({
          data: {
            planDefId: existing.id,
            featureKey: f.featureKey,
            enabled: f.enabled,
            limitDaily: f.limitDaily,
            limitWeekly: f.limitWeekly,
            limitMonthly: f.limitMonthly,
            limitTotal: f.limitTotal,
          },
        }),
      ),
    ]);
  }

  return prisma.subscriptionPlanDefinition.findUnique({
    where: { planId },
    include: FEATURES_INCLUDE,
  });
}

export async function deletePlan(planId: string) {
  const existing = await prisma.subscriptionPlanDefinition.findUnique({ where: { planId } });
  if (!existing) return null;
  // Cascade deletes features via onDelete: Cascade
  await prisma.subscriptionPlanDefinition.delete({ where: { planId } });
  return existing;
}

export async function countTenantsOnPlan(planId: string): Promise<number> {
  // Tenant.plan is an enum matching the planId string
  return prisma.tenant.count({ where: { plan: planId as never } });
}

export async function findTenantsOnPlan(planId: string) {
  return prisma.tenant.findMany({
    where: { plan: planId as never },
    select: { id: true, name: true, slug: true, plan: true, active: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
}
