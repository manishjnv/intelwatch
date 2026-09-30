/**
 * @module OffboardingPurgeWorker
 * @description I-19 Step 8 — Daily purge check for offboarded tenants.
 * Hard-deletes all tenant data from PostgreSQL when purgeScheduledAt <= now.
 * Neo4j, Elasticsearch and Redis deletion are handled by ExternalPurger.
 */
import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './audit-logger.js';
import type { ExternalPurger } from './external-purge.js';

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
  externalPurger?: ExternalPurger,
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
    const result = await purgeTenant(tenant.id, tenant.archiveHash, prisma, auditLogger, externalPurger);
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
  externalPurger?: ExternalPurger,
): Promise<PurgeResult> {
  const deletedCounts: Record<string, number> = {};
  const del = async (key: string, run: () => Promise<{ count: number }>): Promise<void> => {
    deletedCounts[key] = (await run()).count;
  };

  // Compute verification hash before deletion
  const preDeleteManifest = JSON.stringify({ tenantId, purgedAt: new Date().toISOString() });
  const verificationHash = createHash('sha256').update(preDeleteManifest).digest('hex');

  // Step 3 (S154–S159) tenant tables — no FKs, tenant_id column only
  await del('integrations', () => prisma.integration.deleteMany({ where: { tenantId } }));
  await del('integrationLogs', () => prisma.integrationLog.deleteMany({ where: { tenantId } }));
  await del('integrationDeliveries', () => prisma.integrationDelivery.deleteMany({ where: { tenantId } }));
  await del('integrationTickets', () => prisma.integrationTicket.deleteMany({ where: { tenantId } }));
  await del('integrationDocs', () => prisma.integrationDoc.deleteMany({ where: { tenantId } }));
  await del('alertRules', () => prisma.alertRule.deleteMany({ where: { tenantId } }));
  await del('alertChannels', () => prisma.alertChannel.deleteMany({ where: { tenantId } }));
  await del('alertEscalationPolicies', () => prisma.alertEscalationPolicy.deleteMany({ where: { tenantId } }));
  await del('alertMaintenanceWindows', () => prisma.alertMaintenanceWindow.deleteMany({ where: { tenantId } }));
  await del('alerts', () => prisma.alert.deleteMany({ where: { tenantId } }));
  await del('alertHistory', () => prisma.alertHistoryEntry.deleteMany({ where: { tenantId } }));
  await del('alertGroups', () => prisma.alertGroup.deleteMany({ where: { tenantId } }));
  await del('drpAssets', () => prisma.drpAsset.deleteMany({ where: { tenantId } }));
  await del('drpAlerts', () => prisma.drpAlert.deleteMany({ where: { tenantId } }));
  await del('drpScans', () => prisma.drpScan.deleteMany({ where: { tenantId } }));
  await del('drpTakedowns', () => prisma.drpTakedown.deleteMany({ where: { tenantId } }));
  await del('drpAlertFeedback', () => prisma.drpAlertFeedback.deleteMany({ where: { tenantId } }));
  await del('huntingDocs', () => prisma.huntingDoc.deleteMany({ where: { tenantId } }));

  // Older tenant tables the purge missed (S177 review). Overlay/subscription rows point at
  // global catalog rows, not tenant rows; webhook subscriptions must go before their API keys.
  // Nullable tenant_id tables match the tenant only — never the null global-default rows.
  await del('webhookSubscriptions', () => prisma.webhookSubscription.deleteMany({ where: { tenantId } }));
  await del('tenantFeedSubscriptions', () => prisma.tenantFeedSubscription.deleteMany({ where: { tenantId } }));
  await del('tenantIocOverlays', () => prisma.tenantIocOverlay.deleteMany({ where: { tenantId } }));
  await del('tenantItemConsumption', () => prisma.tenantItemConsumption.deleteMany({ where: { tenantId } }));
  await del('feedQuotaPlanAssignments', () => prisma.feedQuotaPlanAssignment.deleteMany({ where: { tenantId } }));
  await del('accessReviews', () => prisma.accessReview.deleteMany({ where: { tenantId } }));
  await del('complianceReports', () => prisma.complianceReport.deleteMany({ where: { tenantId } }));
  await del('mfaEnforcementPolicies', () => prisma.mfaEnforcementPolicy.deleteMany({ where: { tenantId } }));

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

  // Purge non-Postgres datastores: Neo4j graph, Elasticsearch indices, Redis cache.
  // Best-effort and isolated — a failure is recorded but never blocks the PG purge below.
  const externalErrors: string[] = [];
  if (externalPurger) {
    const external = await externalPurger.purge(tenantId);
    deletedCounts['graphNodes'] = external.graphNodesDeleted;
    deletedCounts['esIndices'] = external.esIndicesDeleted;
    deletedCounts['cacheKeys'] = external.redisKeysDeleted;
    externalErrors.push(...external.errors);
  }

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
      ...(externalErrors.length > 0 ? { externalPurgeErrors: externalErrors } : {}),
    },
  });

  return {
    tenantId,
    purged: true,
    deletedCounts,
    archiveHash: existingArchiveHash,
  };
}
