/**
 * Tests for StoreCheckpointService — Redis pattern persistence (P1-1)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoreCheckpointService } from '../src/services/store-checkpoint.js';
import { CorrelationStore } from '../src/schemas/correlation.js';
import type { CorrelatedIOC, CorrelationResult, RuleStats } from '../src/schemas/correlation.js';

// ── Mock ioredis ──────────────────────────────────────────────────
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockQuit = vi.fn();

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    quit: mockQuit,
  })),
}));

vi.mock('@etip/shared-auth', () => ({
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock('@etip/shared-utils', () => ({
  AppError: class AppError extends Error {
    constructor(public statusCode: number, message: string, public code?: string) {
      super(message);
    }
  },
  QUEUES: {},
}));

// ── Helpers ───────────────────────────────────────────────────────

function makeIOC(id: string, tenantId = 't1'): CorrelatedIOC {
  return {
    id, tenantId, iocType: 'ip', value: `1.2.3.${id}`,
    normalizedValue: `1.2.3.${id}`, confidence: 80, severity: 'HIGH',
    tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
    sourceFeedIds: ['f1'], firstSeen: '2026-01-01T00:00:00Z',
    lastSeen: '2026-01-02T00:00:00Z', enrichmentQuality: 0.8,
  };
}

function makeResult(id: string, tenantId = 't1'): CorrelationResult {
  return {
    id, tenantId, correlationType: 'cooccurrence', severity: 'MEDIUM',
    confidence: 0.85,
    entities: [{ entityId: 'ioc-1', entityType: 'ioc', label: 'IP', role: 'primary', confidence: 0.85 }],
    metadata: { algo: 'cooccurrence' },
    suppressed: false, ruleId: 'rule-1',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeRuleStats(ruleId: string): RuleStats {
  return { ruleId, totalResults: 10, fpCount: 2, tpCount: 8, fpRate: 0.2, suppressed: false };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('StoreCheckpointService', () => {
  let svc: StoreCheckpointService;
  const REDIS_URL = 'redis://localhost:6379';
  const TTL_DAYS = 7;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new StoreCheckpointService(REDIS_URL, TTL_DAYS);
  });

  afterEach(async () => {
    await svc.close();
  });

  // ── 1: save() serialises store to Redis ──────────────────────────
  it('persists store state to Redis with correct TTL', async () => {
    mockSet.mockResolvedValue('OK');

    const store = new CorrelationStore();
    store.getTenantIOCs('t1').set('ioc-1', makeIOC('ioc-1'));
    store.getTenantResults('t1').set('cr-1', makeResult('cr-1'));
    store.getTenantRuleStats('t1').set('rule-1', makeRuleStats('rule-1'));

    await svc.save(store);

    expect(mockSet).toHaveBeenCalledOnce();
    const [key, json, exFlag, ttlArg] = mockSet.mock.calls[0]!;
    expect(key).toBe('etip:correlation-engine:store-snapshot');
    expect(exFlag).toBe('EX');
    expect(ttlArg).toBe(TTL_DAYS * 86400);

    const parsed = JSON.parse(json as string) as Record<string, unknown>;
    expect(parsed.v).toBe(1);
    expect(parsed.iocs).toBeDefined();
    expect((parsed.iocs as Record<string, unknown>).t1).toBeDefined();
    expect(parsed.results).toBeDefined();
    expect(parsed.ruleStats).toBeDefined();
  });

  // ── 2: restore() hydrates store from Redis ───────────────────────
  it('restores store state from Redis on startup', async () => {
    const store = new CorrelationStore();
    store.getTenantIOCs('t1').set('ioc-1', makeIOC('ioc-1'));
    store.getTenantResults('t1').set('cr-1', makeResult('cr-1'));
    store.getTenantRuleStats('t1').set('rule-1', makeRuleStats('rule-1'));
    store.getTenantWaves('t1').push({
      id: 'w1', tenantId: 't1', startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T01:00:00Z', peakTime: '2026-01-01T00:30:00Z',
      zScore: 2.5, iocCount: 5, iocIds: ['ioc-1'], detectedAt: '2026-01-01T00:00:00Z',
    });

    // Simulate what save() would produce
    mockSet.mockResolvedValue('OK');
    await svc.save(store);
    const savedJson = mockSet.mock.calls[0]![1] as string;

    // Now restore into a fresh store
    mockGet.mockResolvedValue(savedJson);
    const fresh = new CorrelationStore();
    await svc.restore(fresh);

    expect(fresh.getTenantIOCs('t1').size).toBe(1);
    expect(fresh.getTenantIOCs('t1').get('ioc-1')?.confidence).toBe(80);
    expect(fresh.getTenantResults('t1').size).toBe(1);
    expect(fresh.getTenantRuleStats('t1').size).toBe(1);
    expect(fresh.getTenantWaves('t1').length).toBe(1);
  });

  // ── 3: restore() is graceful when key is absent ──────────────────
  it('starts clean without crashing when Redis key is absent', async () => {
    mockGet.mockResolvedValue(null);

    const fresh = new CorrelationStore();
    await expect(svc.restore(fresh)).resolves.toBeUndefined();
    expect(fresh.iocs.size).toBe(0);
    expect(fresh.results.size).toBe(0);
  });

  // ── 4: restore() is graceful on Redis error ──────────────────────
  it('starts clean when Redis throws during restore', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'));

    const fresh = new CorrelationStore();
    await expect(svc.restore(fresh)).resolves.toBeUndefined();
    expect(fresh.iocs.size).toBe(0);
  });

  // ── 5: scheduleCheckpoint debounces rapid calls ──────────────────
  it('debounces rapid scheduleCheckpoint calls — saves only once', async () => {
    vi.useFakeTimers();
    mockSet.mockResolvedValue('OK');

    const store = new CorrelationStore();
    store.getTenantIOCs('t1').set('ioc-1', makeIOC('ioc-1'));

    svc.scheduleCheckpoint(store);
    svc.scheduleCheckpoint(store);
    svc.scheduleCheckpoint(store);

    // Advance past debounce window (5s)
    await vi.advanceTimersByTimeAsync(6000);

    expect(mockSet).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  // ── 6: close() cleans up the Redis connection ────────────────────
  it('closes Redis connection on close()', async () => {
    mockQuit.mockResolvedValue('OK');
    await svc.close();
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});
