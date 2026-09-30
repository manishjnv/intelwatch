import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceCollection } from '../src/services/evidence-collection.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #9 Evidence Collection', () => {
  let store: HuntingStore;
  let evidence: EvidenceCollection;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const huntId = 'hunt-1';

  beforeEach(async () => {
    store = new HuntingStore();
    evidence = new EvidenceCollection(store);
    const now = new Date().toISOString();
    await store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: userId, createdBy: userId,
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
  });

  it('9.1. adds evidence to a hunt', async () => {
    const item = await evidence.add(tenantId, huntId, userId, {
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

  it('9.2. generates unique evidence IDs', async () => {
    const e1 = await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' });
    const e2 = await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'B', description: 'D' });
    expect(e1.id).not.toBe(e2.id);
  });

  it('9.3. gets evidence by ID', async () => {
    const item = await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' });
    const fetched = await evidence.get(tenantId, huntId, item.id);
    expect(fetched.id).toBe(item.id);
  });

  it('9.4. throws 404 for non-existent evidence', async () => {
    await expect(evidence.get(tenantId, huntId, 'nope')).rejects.toThrow('not found');
  });

  it('9.5. rejects evidence on completed hunt', async () => {
    const session = (await store.getSession(tenantId, huntId))!;
    session.status = 'completed';
    await store.setSession(tenantId, session);
    await expect(evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' }))
      .rejects.toThrow('closed');
  });

  it('9.6. rejects evidence on archived hunt', async () => {
    const session = (await store.getSession(tenantId, huntId))!;
    session.status = 'archived';
    await store.setSession(tenantId, session);
    await expect(evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' }))
      .rejects.toThrow('closed');
  });

  it('9.7. lists evidence with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await evidence.add(tenantId, huntId, userId, { type: 'note', title: `Note ${i}`, description: 'D' });
    }
    const result = await evidence.list(tenantId, huntId, undefined, 1, 3);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(5);
  });

  it('9.8. filters evidence by type', async () => {
    await evidence.add(tenantId, huntId, userId, { type: 'ioc', title: 'IOC', description: 'D' });
    await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Note', description: 'D' });
    await evidence.add(tenantId, huntId, userId, { type: 'ioc', title: 'IOC2', description: 'D' });
    const result = await evidence.list(tenantId, huntId, 'ioc');
    expect(result.data).toHaveLength(2);
  });

  it('9.9. deletes evidence', async () => {
    const item = await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'A', description: 'D' });
    await evidence.delete(tenantId, huntId, item.id);
    await expect(evidence.get(tenantId, huntId, item.id)).rejects.toThrow('not found');
  });

  it('9.10. returns evidence summary', async () => {
    await evidence.add(tenantId, huntId, userId, {
      type: 'ioc', title: 'IP', description: 'D', entityType: 'ip', entityValue: '10.0.0.1',
    });
    await evidence.add(tenantId, huntId, userId, {
      type: 'ioc', title: 'Domain', description: 'D', entityType: 'domain', entityValue: 'evil.com',
    });
    await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Note', description: 'D' });

    const summary = await evidence.getSummary(tenantId, huntId);
    expect(summary.totalItems).toBe(3);
    expect(summary.byType.ioc).toBe(2);
    expect(summary.byType.note).toBe(1);
    expect(summary.uniqueEntities).toBe(2);
    expect(summary.recentItems).toHaveLength(3);
  });

  it('9.11. searches evidence by title', async () => {
    await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Malware analysis', description: 'D' });
    await evidence.add(tenantId, huntId, userId, { type: 'note', title: 'Network scan', description: 'D' });
    const results = await evidence.search(tenantId, huntId, 'malware');
    expect(results).toHaveLength(1);
  });

  it('9.12. searches evidence by tag', async () => {
    await evidence.add(tenantId, huntId, userId, {
      type: 'note', title: 'Test', description: 'D', tags: ['phishing'],
    });
    const results = await evidence.search(tenantId, huntId, 'phishing');
    expect(results).toHaveLength(1);
  });

  it('9.13. stores custom data object', async () => {
    const item = await evidence.add(tenantId, huntId, userId, {
      type: 'enrichment', title: 'VT Result', description: 'VirusTotal scan',
      data: { maliciousCount: 15, totalEngines: 70, scanDate: '2026-01-01' },
    });
    expect(item.data.maliciousCount).toBe(15);
  });

  it('9.14. throws 404 for evidence in non-existent hunt', async () => {
    await expect(evidence.list(tenantId, 'nope')).rejects.toThrow('not found');
  });
});
