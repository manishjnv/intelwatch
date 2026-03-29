/**
 * @module api-gateway/routes/override-repository
 * @description Database access for TenantFeatureOverride.
 */
import { prisma } from '../prisma.js';
import type { TenantFeatureOverrideCreate, TenantFeatureOverrideUpdate } from '@etip/shared-types';

export async function findOverridesForTenant(tenantId: string) {
  return prisma.tenantFeatureOverride.findMany({
    where: { tenantId },
    orderBy: { featureKey: 'asc' },
  });
}

export async function createOverride(
  tenantId: string,
  data: TenantFeatureOverrideCreate,
  grantedBy: string,
) {
  return prisma.tenantFeatureOverride.create({
    data: {
      tenantId,
      featureKey: data.featureKey,
      limitDaily: data.limitDaily ?? null,
      limitWeekly: data.limitWeekly ?? null,
      limitMonthly: data.limitMonthly ?? null,
      limitTotal: data.limitTotal ?? null,
      reason: data.reason ?? null,
      grantedBy,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });
}

export async function updateOverride(
  tenantId: string,
  featureKey: string,
  data: TenantFeatureOverrideUpdate,
) {
  const existing = await prisma.tenantFeatureOverride.findUnique({
    where: { tenantId_featureKey: { tenantId, featureKey } },
  });
  if (!existing) return null;

  return prisma.tenantFeatureOverride.update({
    where: { tenantId_featureKey: { tenantId, featureKey } },
    data: {
      limitDaily: data.limitDaily !== undefined ? (data.limitDaily ?? null) : undefined,
      limitWeekly: data.limitWeekly !== undefined ? (data.limitWeekly ?? null) : undefined,
      limitMonthly: data.limitMonthly !== undefined ? (data.limitMonthly ?? null) : undefined,
      limitTotal: data.limitTotal !== undefined ? (data.limitTotal ?? null) : undefined,
      reason: data.reason !== undefined ? (data.reason ?? null) : undefined,
      expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : undefined,
    },
  });
}

export async function deleteOverride(tenantId: string, featureKey: string) {
  const existing = await prisma.tenantFeatureOverride.findUnique({
    where: { tenantId_featureKey: { tenantId, featureKey } },
  });
  if (!existing) return null;

  await prisma.tenantFeatureOverride.delete({
    where: { tenantId_featureKey: { tenantId, featureKey } },
  });
  return existing;
}

export async function tenantExists(tenantId: string): Promise<boolean> {
  const count = await prisma.tenant.count({ where: { id: tenantId } });
  return count > 0;
}
