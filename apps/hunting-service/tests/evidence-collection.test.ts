import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceCollection } from '../src/services/evidence-collection.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #9 Evidence Collection', () => {
  let store: HuntingStore;
  let evidence: EvidenceCollection;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const huntId = 'hunt-1';

  beforeEach(() => {
    store = new HuntingStore();
    evidence = new EvidenceCollection(store);
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: userId, createdBy: userId,
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
  });

  it('9.1. adds evidence to a hunt', () => {
    const item = evidence.add(tenantId, huntId, userId, {
      type: 'ioc',
      title: 'Malicious IP',
      description: 'Known C2 server',
      entityType: 'ip',
      entityValue: '10.0.0.1',
    });
    expect(item.type).toBe('ioc');
    expect(item.title).toBe('Malicious IP');
    expect(item.addedBy).toBe(userId);
  });

  it('9.2. generates unique evidence IDs', () => {
    const e1 = evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' });
    const e2 = evidence.add(tenantId, huntId, userId, { type: 'note', title: 'B', description: 'D' });
    expect(e1.id).not.toBe(e2.id);
  });

  it('9.3. gets evidence by ID', () => {
    const item = evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' });
    const fetched = evidence.get(tenantId, huntId, item.id);
    expect(fetched.id).toBe(item.id);
  });

  it('9.4. throws 404 for non-existent evidence', () => {
    expect(() => evidence.get(tenantId, huntId, 'nope')).toThrow('not found');
  });

  it('9.5. rejects evidence on completed hunt', () => {
    const session = store.getSession(tenantId, huntId)!;
    session.status = 'completed';
    expect(() => evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' }))
      .toThrow('closed');
  });

  it('9.6. rejects evidence on archived hunt', () => {
    const session = store.getSession(tenantId, huntId)!;
    session.status = 'archived';
    expect(() => evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' }))
      .toThrow('closed');
  });

  it('9.7. lists evidence with pagination', () => {
    for (let i = 0; i < 5; i++) {
      evidence.add(tenantId, huntId, userId, { type: 'note', title: `Note ${i}`, description: 'D' });
    }
    const result = evidence.list(tenantId, huntId, undefined, 1, 3);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(5);
  });

  it('9.8. filters evidence by type', () => {
    evidence.add(tenantId, huntId, userId, { type: 'ioc', title: 'IOC', description: 'D' });
    evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Note', description: 'D' });
    evidence.add(tenantId, huntId, userId, { type: 'ioc', title: 'IOC2', description: 'D' });
    const result = evidence.list(tenantId, huntId, 'ioc');
    expect(result.data).toHaveLength(2);
  });

  it('9.9. deletes evidence', () => {
    const item = evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' });
    evidence.delete(tenantId, huntId, item.id);
    expect(() => evidence.get(tenantId, huntId, item.id)).toThrow('not found');
  });

  it('9.10. returns evidence summary', () => {
    evidence.add(tenantId, huntId, userId, {
      type: 'ioc', title: 'IP', description: 'D', entityType: 'ip', entityValue: '10.0.0.1',
    });
    evidence.add(tenantId, huntId, userId, {
      type: 'ioc', title: 'Domain', description: 'D', entityType: 'domain', entityValue: 'evil.com',
    });
    evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Note', description: 'D' });

    const summary = evidence.getSummary(tenantId, huntId);
    expect(summary.totalItems).toBe(3);
    expect(summary.byType.ioc).toBe(2);
    expect(summary.byType.note).toBe(1);
    expect(summary.uniqueEntities).toBe(2);
    expect(summary.recentItems).toHaveLength(3);
  });

  it('9.11. searches evidence by title', () => {
    evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Malware analysis', description: 'D' });
    evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Network scan', description: 'D' });
    const results = evidence.search(tenantId, huntId, 'malware');
    expect(results).toHaveLength(1);
  });

  it('9.12. searches evidence by tag', () => {
    evidence.add(tenantId, huntId, userId, {
      type: 'note', title: 'Test', description: 'D', tags: ['phishing'],
    });
    const results = evidence.search(tenantId, huntId, 'phishing');
    expect(results).toHaveLength(1);
  });

  it('9.13. stores custom data object', () => {
    const item = evidence.add(tenantId, huntId, userId, {
      type: 'enrichment', title: 'VT Result', description: 'VirusTotal scan',
      data: { maliciousCount: 15, totalEngines: 70, scanDate: '2026-01-01' },
    });
    expect(item.data.maliciousCount).toBe(15);
  });

  it('9.14. throws 404 for evidence in non-existent hunt', () => {
    expect(() => evidence.list(tenantId, 'nope')).toThrow('not found');
  });
});
