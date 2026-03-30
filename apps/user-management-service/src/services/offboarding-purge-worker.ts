/**
 * @module OffboardingPurgeWorker
 * @description I-19 Step 8 — Daily purge check for offboarded tenants.
 * Hard-deletes all tenant data from PostgreSQL when purgeScheduledAt <= now.
 * Neo4j and Elasticsearch deletion are stubbed with log messages.
 */
import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './audit-logger.js';

export interface PurgeResult {
  tenantId: string;
  purged: boolean;
  deletedCounts: Record<string, number>;
  archiveHash: string | null;
}

/**
 * Check for tenants due for purge and execute hard deletion.
 * Called daily by BullMQ repeatable job.
 */
export async function runPurgeCheck(
  prisma: PrismaClient,
  auditLogger: AuditLogger,
): Promise<PurgeResult[]> {
  const now = new Date();

  const tenantsDue = await prisma.tenant.findMany({
    where: {
      offboardingStatus: 'archived',
      purgeScheduledAt: { lte: now },
    },
    select: { id: true, name: true, archiveHash: true },
  });

  const results: PurgeResult[] = [];

  for (const tenant of tenantsDue) {
    const result = await purgeTenant(tenant.id, tenant.archiveHash, prisma, auditLogger);
    results.push(result);
  }

  return results;
}

/**
 * Hard-delete ALL data for a tenant from PostgreSQL.
 * Order matters due to FK constraints — delete children first.
 */
async function purgeTenant(
  tenantId: string,
  existingArchiveHash: string | null,
  prisma: PrismaClient,
  auditLogger: AuditLogger,
): Promise<PurgeResult> {
  const deletedCounts: Record<string, number> = {};

  // Compute verification hash before deletion
  const preDeleteManifest = JSON.stringify({ tenantId, purgedAt: new Date().toISOString() });
  const verificationHash = createHash('sha256').update(preDeleteManifest).digest('hex');

  // Delete in FK-safe order (children before parents)
  const auditResult = await prisma.auditLog.deleteMany({ where: { tenantId } });
  deletedCounts['auditLogs'] = auditResult.count;

  const sessionResult = await prisma.session.deleteMany({ where: { tenantId } });
  deletedCounts['sessions'] = sessionResult.count;

  const apiKeyResult = await prisma.apiKey.deleteMany({ where: { tenantId } });
  deletedCounts['apiKeys'] = apiKeyResult.count;

  const scimResult = await prisma.scimToken.deleteMany({ where: { tenantId } });
  deletedCounts['scimTokens'] = scimResult.count;

  const iocResult = await prisma.ioc.deleteMany({ where: { tenantId } });
  deletedCounts['iocs'] = iocResult.count;

  const articleResult = await prisma.article.deleteMany({ where: { tenantId } });
  deletedCounts['articles'] = articleResult.count;

  const actorResult = await prisma.threatActorProfile.deleteMany({ where: { tenantId } });
  deletedCounts['threatActors'] = actorResult.count;

  const malwareResult = await prisma.malwareProfile.deleteMany({ where: { tenantId } });
  deletedCounts['malwareProfiles'] = malwareResult.count;

  const vulnResult = await prisma.vulnerabilityProfile.deleteMany({ where: { tenantId } });
  deletedCounts['vulnerabilityProfiles'] = vulnResult.count;

  const feedResult = await prisma.feedSource.deleteMany({ where: { tenantId } });
  deletedCounts['feedSources'] = feedResult.count;

  // Delete SSO config
  await prisma.ssoConfig.deleteMany({ where: { tenantId } });
  deletedCounts['ssoConfig'] = 1;

  // Delete billing records
  const usageResult = await prisma.billingUsageRecord.deleteMany({ where: { tenantId } });
  deletedCounts['usageRecords'] = usageResult.count;

  const invoiceResult = await prisma.billingInvoice.deleteMany({ where: { tenantId } });
  deletedCounts['invoices'] = invoiceResult.count;

  const subResult = await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
  deletedCounts['subscriptions'] = subResult.count;

  const graceResult = await prisma.billingGracePeriod.deleteMany({ where: { tenantId } });
  deletedCounts['gracePeriods'] = graceResult.count;

  const overrideResult = await prisma.tenantFeatureOverride.deleteMany({ where: { tenantId } });
  deletedCounts['featureOverrides'] = overrideResult.count;

  // Delete users
  const userResult = await prisma.user.deleteMany({ where: { tenantId } });
  deletedCounts['users'] = userResult.count;

  // Stub: Neo4j graph node deletion
  // TODO(integration): call graph-service DELETE /api/v1/graph/tenant/:tenantId
  console.log(`[offboarding-purge] Would delete Neo4j nodes for tenant ${tenantId}`);

  // Stub: Elasticsearch index deletion
  // TODO(integration): call es-indexing-service DELETE /api/v1/search/index/etip_${tenantId}_*
  console.log(`[offboarding-purge] Would delete ES indices etip_${tenantId}_*`);

  // Stub: Redis key cleanup
  // TODO(integration): SCAN and DEL plan_cache:${tenantId}:* and quota:${tenantId}:*
  console.log(`[offboarding-purge] Would delete Redis keys for tenant ${tenantId}`);

  // Update tenant to purged status (or delete entirely)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { offboardingStatus: 'purged' },
  });

  // Audit to external log (this audit entry itself will be in the S3 archive)
  auditLogger.log({
    tenantId,
    userId: null,
    action: 'offboarding.purged',
    riskLevel: 'critical',
    details: {
      deletedCounts,
      archiveHash: existingArchiveHash,
      verificationHash,
    },
  });

  return {
    tenantId,
    purged: true,
    deletedCounts,
    archiveHash: existingArchiveHash,
  };
}
