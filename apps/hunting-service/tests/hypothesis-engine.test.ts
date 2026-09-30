import { describe, it, expect, beforeEach } from 'vitest';
import { HypothesisEngine } from '../src/services/hypothesis-engine.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #6 Hypothesis Engine', () => {
  let store: HuntingStore;
  let engine: HypothesisEngine;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const huntId = 'hunt-1';

  beforeEach(async () => {
    store = new HuntingStore();
    engine = new HypothesisEngine(store);
    // Seed a hunt session
    const now = new Date().toISOString();
    await store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test Hunt', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: userId, createdBy: userId,
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
  });

  it('6.1. creates a hypothesis with pending verdict', async () => {
    const h = await engine.create(tenantId, huntId, userId, {
      statement: 'APT28 used spear phishing',
      rationale: 'Email headers match known patterns',
    });
    expect(h.verdict).toBe('pending');
    expect(h.statement).toBe('APT28 used spear phishing');
    expect(h.confidence).toBe(0);
  });

  it('6.2. generates unique IDs', async () => {
    const h1 = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const h2 = await engine.create(tenantId, huntId, userId, { statement: 'B', rationale: 'R' });
    expect(h1.id).not.toBe(h2.id);
  });

  it('6.3. gets hypothesis by ID', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const fetched = await engine.get(tenantId, huntId, h.id);
    expect(fetched.id).toBe(h.id);
  });

  it('6.4. throws 404 for non-existent hypothesis', async () => {
    await expect(engine.get(tenantId, huntId, 'nope')).rejects.toThrow('not found');
  });

  it('6.5. throws 404 for non-existent hunt', async () => {
    await expect(engine.create(tenantId, 'bad-hunt', userId, { statement: 'A', rationale: 'R' }))
      .rejects.toThrow('not found');
  });

  it('6.6. lists hypotheses for a hunt', async () => {
    await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.create(tenantId, huntId, userId, { statement: 'B', rationale: 'R' });
    const list = await engine.list(tenantId, huntId);
    expect(list).toHaveLength(2);
  });

  it('6.7. sets verdict to confirmed', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const updated = await engine.setVerdict(tenantId, huntId, h.id, userId, 'confirmed');
    expect(updated.verdict).toBe('confirmed');
    expect(updated.verdictSetBy).toBe(userId);
    expect(updated.verdictSetAt).toBeDefined();
  });

  it('6.8. sets verdict to refuted', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const updated = await engine.setVerdict(tenantId, huntId, h.id, userId, 'refuted');
    expect(updated.verdict).toBe('refuted');
  });

  it('6.9. links evidence and increases confidence', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-2');
    const fetched = await engine.get(tenantId, huntId, h.id);
    expect(fetched.evidenceIds).toHaveLength(2);
    expect(fetched.confidence).toBeGreaterThan(0);
  });

  it('6.10. deduplicates evidence links', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    expect((await engine.get(tenantId, huntId, h.id)).evidenceIds).toHaveLength(1);
  });

  it('6.11. unlinks evidence', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    await engine.unlinkEvidence(tenantId, huntId, h.id, 'ev-1');
    expect((await engine.get(tenantId, huntId, h.id)).evidenceIds).toHaveLength(0);
  });

  it('6.12. confirmed verdict with evidence gives highest confidence', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-2');
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-3');
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-4');
    const confirmed = await engine.setVerdict(tenantId, huntId, h.id, userId, 'confirmed');
    expect(confirmed.confidence).toBe(60); // 4*15=60, capped at 60, * 1.0
  });

  it('6.13. refuted verdict with evidence gives low confidence', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    await engine.linkEvidence(tenantId, huntId, h.id, 'ev-2');
    const refuted = await engine.setVerdict(tenantId, huntId, h.id, userId, 'refuted');
    expect(refuted.confidence).toBeLessThan(10);
  });

  it('6.14. deletes a hypothesis', async () => {
    const h = await engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    await engine.delete(tenantId, huntId, h.id);
    await expect(engine.get(tenantId, huntId, h.id)).rejects.toThrow('not found');
  });

  it('6.15. stores MITRE techniques', async () => {
    const h = await engine.create(tenantId, huntId, userId, {
      statement: 'Spear phishing',
      rationale: 'Email analysis',
      mitreTechniques: ['T1566.001', 'T1059.001'],
    });
    expect(h.mitreTechniques).toContain('T1566.001');
  });
});
