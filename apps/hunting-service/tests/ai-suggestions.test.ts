import { describe, it, expect, beforeEach } from 'vitest';
import { AISuggestions } from '../src/services/ai-suggestions.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession } from '../src/schemas/hunting.js';

describe('Hunting Service — #7 AI Next-Step Suggestions', () => {
  let store: HuntingStore;
  let suggestions: AISuggestions;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    store = new HuntingStore();
    suggestions = new AISuggestions(store, {
      enabled: false,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
      budgetCentsPerDay: 50,
    });
  });

  function seedHunt(overrides: Partial<HuntSession> = {}): HuntSession {
    const now = new Date().toISOString();
    const session: HuntSession = {
      id: 'hunt-1', tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: 'user-1', createdBy: 'user-1',
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
      ...overrides,
    };
    store.setSession(tenantId, session);
    return session;
  }

  it('7.1. returns heuristic suggestions for active hunt', async () => {
    seedHunt();
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    expect(result.source).toBe('heuristic');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('7.2. suggests adding entities when hunt is empty', async () => {
    seedHunt({ entities: [] });
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    const hasEntitySuggestion = result.suggestions.some((s) =>
      s.action.toLowerCase().includes('entities') || s.action.toLowerCase().includes('seed'),
    );
    expect(hasEntitySuggestion).toBe(true);
  });

  it('7.3. provides entity-type-specific suggestions', async () => {
    seedHunt({
      entities: [
        { id: 'e1', type: 'ip', value: '10.0.0.1', addedAt: '', addedBy: '', pivotDepth: 0 },
      ],
    });
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    const hasIpSuggestion = result.suggestions.some((s) => s.entityType === 'ip');
    expect(hasIpSuggestion).toBe(true);
  });

  it('7.4. provides suggestions for draft status', async () => {
    seedHunt({ status: 'draft' });
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    const hasDraftSuggestion = result.suggestions.some((s) =>
      s.rationale.includes('draft'),
    );
    expect(hasDraftSuggestion).toBe(true);
  });

  it('7.5. suggests documenting findings when entities exist but no findings', async () => {
    seedHunt({
      entities: [
        { id: 'e1', type: 'domain', value: 'evil.com', addedAt: '', addedBy: '', pivotDepth: 0 },
      ],
      findings: '',
    });
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    const hasFindingSuggestion = result.suggestions.some((s) =>
      s.action.toLowerCase().includes('finding'),
    );
    expect(hasFindingSuggestion).toBe(true);
  });

  it('7.6. suggests auto-link when no correlations linked', async () => {
    seedHunt({
      entities: [
        { id: 'e1', type: 'ip', value: '10.0.0.1', addedAt: '', addedBy: '', pivotDepth: 0 },
      ],
      correlationLeads: [],
    });
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    const hasCorrelationSuggestion = result.suggestions.some((s) =>
      s.action.toLowerCase().includes('auto-link') || s.action.toLowerCase().includes('correlation'),
    );
    expect(hasCorrelationSuggestion).toBe(true);
  });

  it('7.7. caps suggestions at 5', async () => {
    seedHunt({
      entities: [
        { id: 'e1', type: 'ip', value: '10.0.0.1', addedAt: '', addedBy: '', pivotDepth: 0 },
        { id: 'e2', type: 'domain', value: 'evil.com', addedAt: '', addedBy: '', pivotDepth: 0 },
        { id: 'e3', type: 'hash_sha256', value: 'abc', addedAt: '', addedBy: '', pivotDepth: 0 },
        { id: 'e4', type: 'cve', value: 'CVE-2024-1234', addedAt: '', addedBy: '', pivotDepth: 0 },
      ],
    });
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    expect(result.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('7.8. throws 404 for non-existent hunt', async () => {
    await expect(suggestions.getSuggestions(tenantId, 'nope')).rejects.toThrow('not found');
  });

  it('7.9. returns budget status', () => {
    const status = suggestions.getBudgetStatus();
    expect(status.limitCents).toBe(50);
    expect(status.spentCents).toBe(0);
    expect(status.remaining).toBe(50);
  });

  it('7.10. includes generatedAt timestamp', async () => {
    seedHunt();
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    expect(result.generatedAt).toBeDefined();
    expect(new Date(result.generatedAt).getTime()).toBeGreaterThan(0);
  });

  it('7.11. suggestions have priority field', async () => {
    seedHunt();
    const result = await suggestions.getSuggestions(tenantId, 'hunt-1');
    for (const s of result.suggestions) {
      expect(['high', 'medium', 'low']).toContain(s.priority);
    }
  });
});
