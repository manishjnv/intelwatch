import { describe, it, expect, beforeEach } from 'vitest';
import { AIPatternRecognition } from '../src/services/ai-pattern-recognition.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession, HuntEntity } from '../src/schemas/hunting.js';

describe('Hunting Service — #11 AI Pattern Recognition', () => {
  let store: HuntingStore;
  let recognizer: AIPatternRecognition;
  const tenantId = 'tenant-1';
  const huntId = 'hunt-1';

  beforeEach(() => {
    store = new HuntingStore();
    recognizer = new AIPatternRecognition(store, {
      enabled: false, model: 'claude-sonnet-4-20250514', maxTokens: 2048, budgetCentsPerDay: 100,
    });
  });

  function seedHunt(entities: Array<Partial<HuntEntity>>): void {
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: 'user-1', createdBy: 'user-1',
      entities: entities.map((e, i) => ({
        id: `e${i}`, type: e.type ?? 'ip', value: e.value ?? `10.0.0.${i}`,
        addedAt: now, addedBy: 'user-1', pivotDepth: 0, ...e,
      })) as HuntEntity[],
      timeline: [], findings: '', tags: [], queryHistory: [], correlationLeads: [],
      createdAt: now, updatedAt: now,
    });
  }

  it('11.1. returns empty patterns for hunt with no entities', async () => {
    seedHunt([]);
    const result = await recognizer.analyze(tenantId, huntId);
    expect(result.patterns).toHaveLength(0);
    expect(result.source).toBe('heuristic');
  });

  it('11.2. returns empty for single entity', async () => {
    seedHunt([{ type: 'ip', value: '10.0.0.1' }]);
    const result = await recognizer.analyze(tenantId, huntId);
    expect(result.patterns).toHaveLength(0);
  });

  it('11.3. detects phishing infrastructure pattern', async () => {
    seedHunt([
      { type: 'email', value: 'attacker@evil.com' },
      { type: 'domain', value: 'evil.com' },
      { type: 'url', value: 'https://evil.com/payload' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    const phishing = result.patterns.find((p) => p.name === 'Phishing Infrastructure');
    expect(phishing).toBeDefined();
    expect(phishing!.mitreTechniques).toContain('T1566.001');
  });

  it('11.4. detects C2 infrastructure pattern', async () => {
    seedHunt([
      { type: 'ip', value: '10.0.0.1' },
      { type: 'domain', value: 'c2.evil.com' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    const c2 = result.patterns.find((p) => p.name === 'C2 Infrastructure');
    expect(c2).toBeDefined();
  });

  it('11.5. detects vulnerability exploitation pattern', async () => {
    seedHunt([
      { type: 'cve', value: 'CVE-2024-1234' },
      { type: 'ip', value: '192.168.1.1' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    const vuln = result.patterns.find((p) => p.name === 'Vulnerability Exploitation');
    expect(vuln).toBeDefined();
    expect(vuln!.mitreTechniques).toContain('T1190');
  });

  it('11.6. detects multiple patterns simultaneously', async () => {
    seedHunt([
      { type: 'email', value: 'a@evil.com' },
      { type: 'domain', value: 'evil.com' },
      { type: 'url', value: 'https://evil.com/payload' },
      { type: 'ip', value: '10.0.0.1' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    expect(result.patterns.length).toBeGreaterThanOrEqual(2);
  });

  it('11.7. confidence increases with more matching entities', async () => {
    seedHunt([
      { type: 'ip', value: '10.0.0.1' },
      { type: 'domain', value: 'evil.com' },
      { type: 'ip', value: '10.0.0.2' },
      { type: 'domain', value: 'evil2.com' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    const c2 = result.patterns.find((p) => p.name === 'C2 Infrastructure');
    expect(c2).toBeDefined();
    expect(c2!.confidence).toBeGreaterThan(0.3);
  });

  it('11.8. patterns include entity roles', async () => {
    seedHunt([
      { type: 'ip', value: '10.0.0.1' },
      { type: 'domain', value: 'c2.evil.com' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    const c2 = result.patterns[0]!;
    expect(c2.entities.some((e) => e.role !== '')).toBe(true);
  });

  it('11.9. patterns sorted by confidence (highest first)', async () => {
    seedHunt([
      { type: 'email', value: 'a@evil.com' },
      { type: 'domain', value: 'evil.com' },
      { type: 'url', value: 'https://evil.com/x' },
      { type: 'ip', value: '10.0.0.1' },
      { type: 'cve', value: 'CVE-2024-1234' },
    ]);
    const result = await recognizer.analyze(tenantId, huntId);
    for (let i = 1; i < result.patterns.length; i++) {
      expect(result.patterns[i]!.confidence).toBeLessThanOrEqual(result.patterns[i - 1]!.confidence);
    }
  });

  it('11.10. includes analysis time and entity count', async () => {
    seedHunt([{ type: 'ip', value: '10.0.0.1' }, { type: 'domain', value: 'a.com' }]);
    const result = await recognizer.analyze(tenantId, huntId);
    expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    expect(result.entityCount).toBe(2);
  });

  it('11.11. throws 404 for non-existent hunt', async () => {
    await expect(recognizer.analyze(tenantId, 'nope')).rejects.toThrow('not found');
  });
});
