import { describe, it, expect, beforeEach } from 'vitest';
import { HuntScoring } from '../src/services/hunt-scoring.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession } from '../src/schemas/hunting.js';

describe('Hunting Service — #13 Hunt Scoring', () => {
  let store: HuntingStore;
  let scoring: HuntScoring;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    store = new HuntingStore();
    scoring = new HuntScoring(store);
  });

  async function seedHunt(overrides: Partial<HuntSession> = {}): Promise<HuntSession> {
    const now = new Date().toISOString();
    const session: HuntSession = {
      id: `hunt-${Math.random().toString(36).slice(2, 8)}`,
      tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: 'user-1', createdBy: 'user-1',
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
      ...overrides,
    };
    await store.setSession(tenantId, session);
    return session;
  }

  it('13.1. scores a hunt with components', async () => {
    const hunt = await seedHunt();
    const score = await scoring.scoreHunt(tenantId, hunt.id);
    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.components).toBeDefined();
    expect(score.priority).toBeDefined();
  });

  it('13.2. critical severity scores higher than low', async () => {
    const critical = await seedHunt({ severity: 'critical' });
    const low = await seedHunt({ severity: 'low' });
    const critScore = await scoring.scoreHunt(tenantId, critical.id);
    const lowScore = await scoring.scoreHunt(tenantId, low.id);
    expect(critScore.components.severityScore).toBeGreaterThan(lowScore.components.severityScore);
  });

  it('13.3. more entities increase score', async () => {
    const now = new Date().toISOString();
    const noEntities = await seedHunt({ entities: [] });
    const withEntities = await seedHunt({
      entities: [
        { id: 'e1', type: 'ip', value: '10.0.0.1', addedAt: now, addedBy: 'u', pivotDepth: 0 },
        { id: 'e2', type: 'domain', value: 'evil.com', addedAt: now, addedBy: 'u', pivotDepth: 0 },
      ],
    });
    const noScore = await scoring.scoreHunt(tenantId, noEntities.id);
    const withScore = await scoring.scoreHunt(tenantId, withEntities.id);
    expect(withScore.components.entityRiskScore).toBeGreaterThan(noScore.components.entityRiskScore);
  });

  it('13.4. correlation leads increase score', async () => {
    const noLeads = await seedHunt({ correlationLeads: [] });
    const withLeads = await seedHunt({ correlationLeads: ['lead-1', 'lead-2'] });
    const noScore = await scoring.scoreHunt(tenantId, noLeads.id);
    const withScore = await scoring.scoreHunt(tenantId, withLeads.id);
    expect(withScore.components.correlationScore).toBeGreaterThan(noScore.components.correlationScore);
  });

  it('13.5. provides priority recommendation', async () => {
    const hunt = await seedHunt();
    const score = await scoring.scoreHunt(tenantId, hunt.id);
    expect(score.recommendation.length).toBeGreaterThan(0);
  });

  it('13.6. recommends adding entities when empty', async () => {
    const hunt = await seedHunt({ entities: [] });
    const score = await scoring.scoreHunt(tenantId, hunt.id);
    expect(score.recommendation).toContain('entities');
  });

  it('13.7. prioritizes multiple hunts by score', async () => {
    await seedHunt({ severity: 'low', entities: [] });
    const now = new Date().toISOString();
    await seedHunt({
      severity: 'critical',
      entities: [
        { id: 'e1', type: 'ip', value: '10.0.0.1', addedAt: now, addedBy: 'u', pivotDepth: 0 },
      ],
      correlationLeads: ['lead-1'],
    });

    const ranked = await scoring.prioritize(tenantId);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.score.overallScore).toBeGreaterThanOrEqual(ranked[1]!.score.overallScore);
  });

  it('13.8. excludes completed/archived from prioritization', async () => {
    await seedHunt({ status: 'completed' });
    await seedHunt({ status: 'archived' });
    await seedHunt({ status: 'active' });
    const ranked = await scoring.prioritize(tenantId);
    expect(ranked).toHaveLength(1);
  });

  it('13.9. recent hunts score higher on recency', async () => {
    const recent = await seedHunt({ updatedAt: new Date().toISOString() });
    const old = await seedHunt({ updatedAt: new Date(Date.now() - 200 * 3600000).toISOString() });
    const recentScore = await scoring.scoreHunt(tenantId, recent.id);
    const oldScore = await scoring.scoreHunt(tenantId, old.id);
    expect(recentScore.components.recencyScore).toBeGreaterThan(oldScore.components.recencyScore);
  });

  it('13.10. throws 404 for non-existent hunt', async () => {
    await expect(scoring.scoreHunt(tenantId, 'nope')).rejects.toThrow('not found');
  });
});
