import { describe, it, expect, beforeEach } from 'vitest';
import { HypothesisEngine } from '../src/services/hypothesis-engine.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession } from '../src/schemas/hunting.js';

describe('Hunting Service — #6 Hypothesis Engine', () => {
  let store: HuntingStore;
  let engine: HypothesisEngine;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const huntId = 'hunt-1';

  beforeEach(() => {
    store = new HuntingStore();
    engine = new HypothesisEngine(store);
    // Seed a hunt session
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test Hunt', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: userId, createdBy: userId,
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
  });

  it('6.1. creates a hypothesis with pending verdict', () => {
    const h = engine.create(tenantId, huntId, userId, {
      statement: 'APT28 used spear phishing',
      rationale: 'Email headers match known patterns',
    });
    expect(h.verdict).toBe('pending');
    expect(h.statement).toBe('APT28 used spear phishing');
    expect(h.confidence).toBe(0);
  });

  it('6.2. generates unique IDs', () => {
    const h1 = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const h2 = engine.create(tenantId, huntId, userId, { statement: 'B', rationale: 'R' });
    expect(h1.id).not.toBe(h2.id);
  });

  it('6.3. gets hypothesis by ID', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const fetched = engine.get(tenantId, huntId, h.id);
    expect(fetched.id).toBe(h.id);
  });

  it('6.4. throws 404 for non-existent hypothesis', () => {
    expect(() => engine.get(tenantId, huntId, 'nope')).toThrow('not found');
  });

  it('6.5. throws 404 for non-existent hunt', () => {
    expect(() => engine.create(tenantId, 'bad-hunt', userId, { statement: 'A', rationale: 'R' }))
      .toThrow('not found');
  });

  it('6.6. lists hypotheses for a hunt', () => {
    engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.create(tenantId, huntId, userId, { statement: 'B', rationale: 'R' });
    const list = engine.list(tenantId, huntId);
    expect(list).toHaveLength(2);
  });

  it('6.7. sets verdict to confirmed', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const updated = engine.setVerdict(tenantId, huntId, h.id, userId, 'confirmed');
    expect(updated.verdict).toBe('confirmed');
    expect(updated.verdictSetBy).toBe(userId);
    expect(updated.verdictSetAt).toBeDefined();
  });

  it('6.8. sets verdict to refuted', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    const updated = engine.setVerdict(tenantId, huntId, h.id, userId, 'refuted');
    expect(updated.verdict).toBe('refuted');
  });

  it('6.9. links evidence and increases confidence', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-2');
    const fetched = engine.get(tenantId, huntId, h.id);
    expect(fetched.evidenceIds).toHaveLength(2);
    expect(fetched.confidence).toBeGreaterThan(0);
  });

  it('6.10. deduplicates evidence links', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    expect(engine.get(tenantId, huntId, h.id).evidenceIds).toHaveLength(1);
  });

  it('6.11. unlinks evidence', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    engine.unlinkEvidence(tenantId, huntId, h.id, 'ev-1');
    expect(engine.get(tenantId, huntId, h.id).evidenceIds).toHaveLength(0);
  });

  it('6.12. confirmed verdict with evidence gives highest confidence', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-2');
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-3');
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-4');
    const confirmed = engine.setVerdict(tenantId, huntId, h.id, userId, 'confirmed');
    expect(confirmed.confidence).toBe(60); // 4*15=60, capped at 60, * 1.0
  });

  it('6.13. refuted verdict with evidence gives low confidence', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-1');
    engine.linkEvidence(tenantId, huntId, h.id, 'ev-2');
    const refuted = engine.setVerdict(tenantId, huntId, h.id, userId, 'refuted');
    expect(refuted.confidence).toBeLessThan(10);
  });

  it('6.14. deletes a hypothesis', () => {
    const h = engine.create(tenantId, huntId, userId, { statement: 'A', rationale: 'R' });
    engine.delete(tenantId, huntId, h.id);
    expect(() => engine.get(tenantId, huntId, h.id)).toThrow('not found');
  });

  it('6.15. stores MITRE techniques', () => {
    const h = engine.create(tenantId, huntId, userId, {
      statement: 'Spear phishing',
      rationale: 'Email analysis',
      mitreTechniques: ['T1566.001', 'T1059.001'],
    });
    expect(h.mitreTechniques).toContain('T1566.001');
  });
});
