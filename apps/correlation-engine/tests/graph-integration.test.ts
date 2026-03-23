import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphIntegrationService } from '../src/services/graph-integration.js';
import type { CorrelatedIOC, CorrelationResult } from '../src/schemas/correlation.js';
import pino from 'pino';

// Mock shared-auth
vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn().mockReturnValue('mock-jwt-token'),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
  verifyToken: vi.fn(),
  verifyServiceToken: vi.fn(),
}));

const logger = pino({ level: 'silent' });

const defaultConfig = {
  graphServiceUrl: 'http://threat-graph:3012',
  syncEnabled: true,
  maxRelationshipsPerBatch: 1000,
  maxRetries: 1,
  retryDelayMs: 10,
};

function makeIOC(id: string, overrides: Partial<CorrelatedIOC> = {}): CorrelatedIOC {
  return {
    id, tenantId: 't1', iocType: 'ip', value: `1.2.3.${id}`,
    normalizedValue: `1.2.3.${id}`, confidence: 80, severity: 'HIGH',
    tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
    sourceFeedIds: ['f1'], firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(), enrichmentQuality: 0.7,
    ...overrides,
  };
}

function makeResult(overrides: Partial<CorrelationResult> = {}): CorrelationResult {
  return {
    id: 'cr-1', tenantId: 't1', correlationType: 'cooccurrence',
    severity: 'MEDIUM', confidence: 0.85,
    entities: [
      { entityId: 'ioc-1', entityType: 'ioc', label: '1.2.3.4', role: 'primary', confidence: 0.8 },
      { entityId: 'ioc-2', entityType: 'ioc', label: '5.6.7.8', role: 'related', confidence: 0.7 },
    ],
    metadata: {}, suppressed: false, ruleId: 'rule-cooc',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GraphIntegrationService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { nodesCreated: 0, nodesUpdated: 0, nodesFailed: 0,
          relationshipsCreated: 2, relationshipsFailed: 0, nodeIds: [], errors: [] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('isEnabled', () => {
    it('returns false when syncEnabled is false', () => {
      const svc = new GraphIntegrationService({ ...defaultConfig, syncEnabled: false }, logger);
      expect(svc.isEnabled()).toBe(false);
    });

    it('returns true when syncEnabled is true', () => {
      const svc = new GraphIntegrationService(defaultConfig, logger);
      expect(svc.isEnabled()).toBe(true);
    });
  });

  describe('mapCorrelationToGraphRelationships', () => {
    const svc = new GraphIntegrationService(defaultConfig, logger);
    const iocs = new Map<string, CorrelatedIOC>([
      ['ioc-1', makeIOC('ioc-1')],
      ['ioc-2', makeIOC('ioc-2')],
    ]);

    it('maps cooccurrence to RESOLVES_TO', () => {
      const result = makeResult({ correlationType: 'cooccurrence' });
      const rels = svc.mapCorrelationToGraphRelationships(result, iocs);
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]!.type).toBe('RESOLVES_TO');
      expect(rels[0]!.properties.correlationType).toBe('cooccurrence');
    });

    it('maps infrastructure_overlap to HOSTED_ON', () => {
      const result = makeResult({ correlationType: 'infrastructure_overlap' });
      const rels = svc.mapCorrelationToGraphRelationships(result, iocs);
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]!.type).toBe('HOSTED_ON');
    });

    it('maps campaign_cluster to OBSERVED_IN', () => {
      const result = makeResult({ correlationType: 'campaign_cluster' });
      const rels = svc.mapCorrelationToGraphRelationships(result, iocs);
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]!.type).toBe('OBSERVED_IN');
    });

    it('maps ttp_similarity to INDICATES', () => {
      const result = makeResult({ correlationType: 'ttp_similarity' });
      const rels = svc.mapCorrelationToGraphRelationships(result, iocs);
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]!.type).toBe('INDICATES');
    });
  });

  describe('pushCorrelations', () => {
    it('returns GraphSyncResult with counts', async () => {
      const svc = new GraphIntegrationService(defaultConfig, logger);
      const iocs = new Map([
        ['ioc-1', makeIOC('ioc-1')],
        ['ioc-2', makeIOC('ioc-2')],
      ]);

      const syncResult = await svc.pushCorrelations('t1', [makeResult()], iocs);
      expect(syncResult.relationshipsCreated).toBeGreaterThanOrEqual(0);
      expect(syncResult.errors).toBeDefined();
      expect(syncResult.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns graceful result when service is down', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'));

      const svc = new GraphIntegrationService({ ...defaultConfig, maxRetries: 1, retryDelayMs: 1 }, logger);
      const iocs = new Map([
        ['ioc-1', makeIOC('ioc-1')],
        ['ioc-2', makeIOC('ioc-2')],
      ]);

      const syncResult = await svc.pushCorrelations('t1', [makeResult()], iocs);
      expect(syncResult.relationshipsFailed).toBeGreaterThan(0);
      expect(syncResult.errors.length).toBeGreaterThan(0);
    });

    it('returns empty result when disabled', async () => {
      const svc = new GraphIntegrationService({ ...defaultConfig, syncEnabled: false }, logger);
      const syncResult = await svc.pushCorrelations('t1', [makeResult()], new Map());
      expect(syncResult.relationshipsCreated).toBe(0);
      expect(syncResult.relationshipsFailed).toBe(0);
    });
  });
});
