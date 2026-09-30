import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { TakedownGenerator } from '../src/services/takedown-generator.js';
import type { DRPAlert } from '../src/schemas/drp.js';

const T = 'tenant-takedown-1';

function createAlert(overrides: Partial<DRPAlert> = {}): DRPAlert {
  return {
    id: 'alert-td-1',
    tenantId: T,
    assetId: 'example.com',
    type: 'typosquatting',
    severity: 'high',
    status: 'open',
    title: 'Typosquat: examp1e.com',
    description: 'Test typosquat',
    evidence: [{
      id: 'ev-1',
      type: 'dns_record',
      title: 'DNS lookup for examp1e.com',
      data: { hostingProvider: 'Cloudflare' },
      collectedAt: '2026-03-23T10:00:00Z',
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

describe('TakedownGenerator (#11)', () => {
  let store: DRPStore;
  let generator: TakedownGenerator;
  let alert: DRPAlert;

  beforeEach(async () => {
    store = new DRPStore();
    generator = new TakedownGenerator(store);
    alert = createAlert();
    await store.setAlert(T, alert);
  });

  it('generates a registrar takedown request', async () => {
    const td = await generator.generate(T, alert, 'registrar');
    expect(td.id).toBeDefined();
    expect(td.alertId).toBe('alert-td-1');
    expect(td.tenantId).toBe(T);
    expect(td.platform).toBe('registrar');
    expect(td.status).toBe('draft');
    expect(td.subject).toContain('Takedown');
    expect(td.body).toContain('examp1e.com');
    expect(td.body).toContain('example.com');
    expect(td.evidence.length).toBe(1);
  });

  it('generates a hosting takedown request', async () => {
    const td = await generator.generate(T, alert, 'hosting');
    expect(td.subject).toContain('Abuse Report');
    expect(td.body).toContain('examp1e.com');
  });

  it('generates a social platform takedown request', async () => {
    const socialAlert = createAlert({ id: 'social-td', type: 'social_impersonation', detectedValue: '@fakebrand' });
    const td = await generator.generate(T, socialAlert, 'social');
    expect(td.subject).toContain('Impersonation');
    expect(td.body).toContain('@fakebrand');
  });

  it('generates an app store takedown request', async () => {
    const appAlert = createAlert({ id: 'app-td', type: 'rogue_app', detectedValue: 'com.fake.app' });
    const td = await generator.generate(T, appAlert, 'app_store');
    expect(td.subject).toContain('Rogue App');
    expect(td.body).toContain('com.fake.app');
  });

  it('uses contact override when provided', async () => {
    const td = await generator.generate(T, alert, 'registrar', { email: 'custom@abuse.com', name: 'Custom Team' });
    expect(td.contactEmail).toBe('custom@abuse.com');
    expect(td.contactName).toBe('Custom Team');
  });

  it('excludes evidence when includeEvidence=false', async () => {
    const td = await generator.generate(T, alert, 'registrar', undefined, false);
    expect(td.body).toContain('available upon request');
  });

  it('includes evidence by default', async () => {
    const td = await generator.generate(T, alert, 'registrar');
    expect(td.body).toContain('DNS lookup');
  });

  it('stores takedown in store', async () => {
    const td = await generator.generate(T, alert, 'registrar');
    const stored = await store.getTakedown(T, td.id);
    expect(stored).toBeDefined();
    expect(stored!.alertId).toBe(alert.id);
  });

  it('retrieves takedowns by alert', async () => {
    await generator.generate(T, alert, 'registrar');
    await generator.generate(T, alert, 'hosting');
    const takedowns = await generator.getByAlert(T, alert.id);
    expect(takedowns).toHaveLength(2);
  });

  it('updates takedown status', async () => {
    const td = await generator.generate(T, alert, 'registrar');
    const updated = await generator.updateStatus(T, td.id, 'sent');
    expect(updated.status).toBe('sent');
    expect(updated.updatedAt).toBeDefined();
  });

  it('throws when updating nonexistent takedown', async () => {
    await expect(generator.updateStatus(T, 'fake-id', 'sent')).rejects.toThrow('Takedown request not found');
  });

  it('body includes severity and confidence', async () => {
    const td = await generator.generate(T, alert, 'registrar');
    expect(td.body).toContain('HIGH');
    expect(td.body).toContain('85');
  });

  it('defaults to registrar template for unknown platform', async () => {
    const td = await generator.generate(T, alert, 'unknown' as string);
    expect(td.subject).toContain('Takedown');
  });
});
