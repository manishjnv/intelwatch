import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AIAlertEnricher } from '../src/services/ai-enrichment.js';
import type { DRPAlert } from '../src/schemas/drp.js';

const T = 'tenant-ai-1';

function createAlert(overrides: Partial<DRPAlert> = {}): DRPAlert {
  return {
    id: 'alert-1',
    tenantId: T,
    assetId: 'example.com',
    type: 'typosquatting',
    severity: 'high',
    status: 'open',
    title: 'Test alert',
    description: 'Test',
    evidence: [{
      id: 'ev-1',
      type: 'dns_record',
      title: 'DNS record',
      data: { hostingProvider: 'Cloudflare' },
      collectedAt: new Date().toISOString(),
    }],
    confidence: 0.85,
    confidenceReasons: [],
    signalIds: [],
    assignedTo: null,
    triageNotes: '',
    tags: [],
    detectedValue: 'examp1e.com',
    sourceUrl: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AIAlertEnricher (#7)', () => {
  let store: DRPStore;
  let enricher: AIAlertEnricher;
  let alert: DRPAlert;

  beforeEach(() => {
    store = new DRPStore();
    enricher = new AIAlertEnricher(store, {
      enabled: true,
      maxBudgetPerDay: 1.0,
      costPerCall: 0.01,
    });
    alert = createAlert();
    store.setAlert(T, alert);
  });

  it('enriches an alert with hosting provider and contacts', () => {
    const result = enricher.enrich(T, alert, false);
    expect(result.alertId).toBe('alert-1');
    expect(result.hostingProvider).toBeDefined();
    expect(result.takedownContacts.length).toBeGreaterThan(0);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.riskAssessment).toContain('typosquatting');
    expect(result.model).toBe('claude-haiku-4-5-20251001');
    expect(result.cached).toBe(false);
  });

  it('returns cached result on second call', () => {
    enricher.enrich(T, alert, false);
    const cached = enricher.enrich(T, alert, false);
    expect(cached.cached).toBe(true);
  });

  it('force refresh bypasses cache', () => {
    enricher.enrich(T, alert, false);
    const refreshed = enricher.enrich(T, alert, true);
    expect(refreshed.cached).toBe(false);
  });

  it('throws when AI is disabled', () => {
    const disabled = new AIAlertEnricher(store, { enabled: false, maxBudgetPerDay: 1, costPerCall: 0.01 });
    expect(() => disabled.enrich(T, alert, false)).toThrow('AI enrichment is disabled');
  });

  it('throws when daily budget is exceeded', () => {
    const tightBudget = new AIAlertEnricher(store, { enabled: true, maxBudgetPerDay: 0.02, costPerCall: 0.01 });
    tightBudget.enrich(T, createAlert({ id: 'a1' }), false);
    tightBudget.enrich(T, createAlert({ id: 'a2' }), false);
    expect(() => tightBudget.enrich(T, createAlert({ id: 'a3' }), false)).toThrow('budget exceeded');
  });

  it('returns correct budget status', () => {
    enricher.enrich(T, alert, false);
    const status = enricher.getBudgetStatus();
    expect(status.dailyCalls).toBe(1);
    expect(status.dailyCost).toBeCloseTo(0.01);
    expect(status.remaining).toBeCloseTo(0.99);
    expect(status.maxBudget).toBe(1.0);
  });

  it('generates different contacts for social_impersonation', () => {
    const socialAlert = createAlert({ id: 'social-1', type: 'social_impersonation' });
    const result = enricher.enrich(T, socialAlert, false);
    expect(result.takedownContacts.some((c) => c.type === 'social_platform')).toBe(true);
  });

  it('generates different contacts for rogue_app', () => {
    const appAlert = createAlert({ id: 'app-1', type: 'rogue_app' });
    const result = enricher.enrich(T, appAlert, false);
    expect(result.takedownContacts.some((c) => c.type === 'app_store')).toBe(true);
  });

  it('includes registrar for typosquatting alerts', () => {
    const result = enricher.enrich(T, alert, false);
    expect(result.registrar).toBeDefined();
  });

  it('recommended actions include credential-specific actions for credential_leak', () => {
    const credAlert = createAlert({ id: 'cred-1', type: 'credential_leak', severity: 'critical' });
    const result = enricher.enrich(T, credAlert, false);
    expect(result.recommendedActions.some((a) => a.includes('password reset'))).toBe(true);
  });

  it('stores enrichment result', () => {
    enricher.enrich(T, alert, false);
    const stored = store.getAIEnrichment(T, alert.id);
    expect(stored).toBeDefined();
    expect(stored!.alertId).toBe(alert.id);
  });
});
