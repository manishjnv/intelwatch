/**
 * @module offboarding-purge-worker.test
 * @description Tests for I-19 offboarding purge worker — Postgres hard-delete
 * across every tenant table (incl. Step 3 S154-S159 tables) + external purge wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import { runPurgeCheck } from '../src/services/offboarding-purge-worker.js';
import type { AuditLogger } from '../src/services/audit-logger.js';
import type { ExternalPurger } from '../src/services/external-purge.js';

// Every Prisma model purgeTenant() deletes from, keyed by the model accessor name.
const DELETE_MODELS = [
  'auditLog',
  'session',
  'apiKey',
  'scimToken',
  'ioc',
  'article',
  'threatActorProfile',
  'malwareProfile',
  'vulnerabilityProfile',
  'feedSource',
  'ssoConfig',
  'billingUsageRecord',
  'billingInvoice',
  'tenantSubscription',
  'billingGracePeriod',
  'tenantFeatureOverride',
  'integration',
  'integrationLog',
  'integrationDelivery',
  'integrationTicket',
  'integrationDoc',
  'alertRule',
  'alertChannel',
  'alertEscalationPolicy',
  'alertMaintenanceWindow',
  'alert',
  'alertHistoryEntry',
  'alertGroup',
  'drpAsset',
  'drpAlert',
  'drpScan',
  'drpTakedown',
  'drpAlertFeedback',
  'huntingDoc',
  'webhookSubscription',
  'tenantFeedSubscription',
  'tenantIocOverlay',
  'tenantItemConsumption',
  'feedQuotaPlanAssignment',
  'accessReview',
  'complianceReport',
  'mfaEnforcementPolicy',
  'user',
] as const;

// Keys expected in the returned deletedCounts map (a few are static or renamed).
const EXPECTED_KEYS = [
  'auditLogs',
  'sessions',
  'apiKeys',
  'scimTokens',
  'iocs',
  'articles',
  'threatActors',
  'malwareProfiles',
  'vulnerabilityProfiles',
  'feedSources',
  'ssoConfig',
  'usageRecords',
  'invoices',
  'subscriptions',
  'gracePeriods',
  'featureOverrides',
  'integrations',
  'integrationLogs',
  'integrationDeliveries',
  'integrationTickets',
  'integrationDocs',
  'alertRules',
  'alertChannels',
  'alertEscalationPolicies',
  'alertMaintenanceWindows',
  'alerts',
  'alertHistory',
  'alertGroups',
  'drpAssets',
  'drpAlerts',
  'drpScans',
  'drpTakedowns',
  'drpAlertFeedback',
  'huntingDocs',
  'webhookSubscriptions',
  'tenantFeedSubscriptions',
  'tenantIocOverlays',
  'tenantItemConsumption',
  'feedQuotaPlanAssignments',
  'accessReviews',
  'complianceReports',
  'mfaEnforcementPolicies',
  'users',
];

function mockPrisma(tenantsDue: Array<{ id: string; name: string; archiveHash: string | null }>) {
  const deleteMany = vi.fn(async () => ({ count: 1 }));
  const models: Record<string, unknown> = {};
  for (const model of DELETE_MODELS) {
    models[model] = { deleteMany };
  }
  models['tenant'] = {
    findMany: vi.fn(async () => tenantsDue),
    update: vi.fn(async () => ({})),
  };
  return { prisma: models as never, deleteMany };
}

function mockAuditLogger(): AuditLogger {
  return { log: vi.fn(() => 'audit-id') } as unknown as AuditLogger;
}

function mockExternalPurger(overrides: Partial<Awaited<ReturnType<ExternalPurger['purge']>>> = {}) {
  return {
    purge: vi.fn(async () => ({
      redisKeysDeleted: 0,
      graphNodesDeleted: 0,
      esIndicesDeleted: 0,
      errors: [],
      ...overrides,
    })),
  } as unknown as ExternalPurger;
}

describe('runPurgeCheck / purgeTenant', () => {
  it('purges every tenant table exactly once, updates tenant status, and audits', async () => {
    const { prisma, deleteMany } = mockPrisma([{ id: 't1', name: 'Tenant One', archiveHash: 'hash1' }]);
    const auditLogger = mockAuditLogger();
    const externalPurger = mockExternalPurger();

    const results = await runPurgeCheck(prisma, auditLogger, externalPurger);

    expect(results).toHaveLength(1);
    expect(deleteMany).toHaveBeenCalledTimes(DELETE_MODELS.length);
    for (const call of deleteMany.mock.calls) {
      expect(call[0]).toEqual({ where: { tenantId: 't1' } });
    }

    for (const key of EXPECTED_KEYS) {
      expect(results[0].deletedCounts).toHaveProperty(key);
    }

    expect((prisma as { tenant: { update: ReturnType<typeof vi.fn> } }).tenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { offboardingStatus: 'purged' },
    });

    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', action: 'offboarding.purged' }),
    );
    expect(externalPurger.purge).toHaveBeenCalledWith('t1');
    expect(results[0].purged).toBe(true);
  });

  it('does nothing when no tenants are due for purge', async () => {
    const { prisma, deleteMany } = mockPrisma([]);
    const auditLogger = mockAuditLogger();
    const externalPurger = mockExternalPurger();

    const results = await runPurgeCheck(prisma, auditLogger, externalPurger);

    expect(results).toEqual([]);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(externalPurger.purge).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it('records external purge errors but still completes the Postgres purge', async () => {
    const { prisma, deleteMany } = mockPrisma([{ id: 't2', name: 'Tenant Two', archiveHash: null }]);
    const auditLogger = mockAuditLogger();
    const externalPurger = mockExternalPurger({ errors: ['graph: neo4j down'] });

    const results = await runPurgeCheck(prisma, auditLogger, externalPurger);

    expect(deleteMany).toHaveBeenCalledTimes(DELETE_MODELS.length);
    expect(results[0].purged).toBe(true);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ externalPurgeErrors: ['graph: neo4j down'] }),
      }),
    );
  });
});
