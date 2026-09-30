import { describe, it, expect, vi } from 'vitest';

// IntegrationStore (used only by the credential-rotation case) reaches the real
// prisma singleton for its own integrations cache — mock it like records-persistence.test.ts.
vi.mock('../src/prisma.js', () => ({
  prisma: {
    integration: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  disconnectPrisma: vi.fn(),
}));

import { AlertRoutingEngine } from '../src/services/alert-routing-engine.js';
import { FieldMappingStore } from '../src/services/field-mapping-store.js';
import { TemplateEngine } from '../src/services/template-engine.js';
import { StixCollectionStore } from '../src/services/stix-collection-store.js';
import { ExportScheduler } from '../src/services/export-scheduler.js';
import { BulkExportService } from '../src/services/bulk-export.js';
import { StixExportService } from '../src/services/stix-export.js';
import { CredentialRotationService } from '../src/services/credential-rotation.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { MemoryDocRepo } from '../src/services/doc-repo.js';
import type { DocRepo } from '../src/services/doc-repo.js';
import type { RoutingRule, FieldMappingPreset, TicketTemplate, ManagedTaxiiCollection,
  ExportSchedule, CredentialRotationRecord, AuditEntry, CreateRoutingRuleInput,
  CreateFieldMappingPresetInput, CreateTicketTemplateInput, CreateTaxiiCollectionInput,
  CreateExportScheduleInput, CreateIntegrationInput } from '../src/schemas/integration.js';
import type { ExportRun } from '../src/services/export-scheduler.js';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const ruleInput: CreateRoutingRuleInput = {
  name: 'r1', description: '', enabled: true, priority: 10,
  conditions: [{ field: 'severity', operator: 'equals', value: 'critical' }],
  conditionLogic: 'AND',
  actions: [{ type: 'route_to_siem', integrationId: '00000000-0000-0000-0000-000000000001', config: {} }],
  triggerEvents: ['alert.created'],
};

const presetInput: CreateFieldMappingPresetInput = {
  name: 'preset-1', description: '', targetType: 'splunk_hec',
  mappings: [{ sourceField: 'a', targetField: 'b', transform: 'none' }],
};

const templateInput: CreateTicketTemplateInput = {
  name: 'template-1', description: '', targetType: 'jira', titleTemplate: 'T', bodyTemplate: 'B',
  priorityMapping: {}, additionalFields: {},
};

const collectionInput: CreateTaxiiCollectionInput = {
  title: 'collection-1', description: '', canRead: true, canWrite: false,
  mediaTypes: ['application/stix+json;version=2.1'], pollingIntervalMinutes: 60,
  entityFilter: { entityType: 'iocs' },
};

const scheduleInput: CreateExportScheduleInput = {
  name: 'sched-1', cronExpression: '0 6 * * *', format: 'json', entityType: 'iocs',
  filters: {}, enabled: true, limit: 1000,
};

const integrationInput: CreateIntegrationInput = {
  name: 'SIEM', type: 'splunk_hec', enabled: true, triggers: ['alert.created'], fieldMappings: [], credentials: {},
};

describe('Integration config/audit documents persistence (Step 3 S157)', () => {
  it('routing rule written via instance #1 is read back via a fresh instance #2 sharing the repo', async () => {
    const repo = new MemoryDocRepo<RoutingRule>();
    const engine1 = new AlertRoutingEngine(repo);
    const rule = await engine1.createRule(TENANT_A, ruleInput);

    const engine2 = new AlertRoutingEngine(repo);
    expect(await engine2.getRule(rule.id, TENANT_A)).toEqual(rule);
    expect(await engine2.getRule(rule.id, TENANT_B)).toBeUndefined();
  });

  it('field mapping preset survives a restart and is tenant-isolated', async () => {
    const repo = new MemoryDocRepo<FieldMappingPreset>();
    const store1 = new FieldMappingStore(repo);
    const preset = await store1.createPreset(TENANT_A, presetInput);

    const store2 = new FieldMappingStore(repo);
    expect(await store2.getPreset(preset.id, TENANT_A)).toEqual(preset);
    expect(await store2.getPreset(preset.id, TENANT_B)).toBeUndefined();
    expect(await store2.deletePreset(preset.id, TENANT_B)).toBe(false);
    expect(await store2.deletePreset(preset.id, TENANT_A)).toBe(true);
  });

  it('custom ticket template survives a restart; system defaults are never persisted per tenant', async () => {
    const repo = new MemoryDocRepo<TicketTemplate>();
    const engine1 = new TemplateEngine(repo);
    const template = await engine1.createTemplate(TENANT_A, templateInput);

    const engine2 = new TemplateEngine(repo);
    expect(await engine2.getTemplate(template.id, TENANT_A)).toEqual(template);
    expect(await engine2.getTemplate(template.id, TENANT_B)).toBeUndefined();

    // System defaults appear for every instance without ever being saved to the repo.
    const { data } = await engine2.listTemplates(TENANT_B, { page: 1, limit: 50 });
    expect(data.some((t) => t.tenantId === 'system')).toBe(true);
    expect(await repo.list('system')).toEqual([]);
  });

  it('TAXII collection survives a restart; deleting it removes its objects doc', async () => {
    const collections = new MemoryDocRepo<ManagedTaxiiCollection>();
    const objects = new MemoryDocRepo<{ id: string; tenantId: string; objects: unknown[] }>();
    const store1 = new StixCollectionStore(collections, objects);
    const collection = await store1.createCollection(TENANT_A, collectionInput);
    await store1.addObjects(collection.id, TENANT_A, [
      { id: 'stix--1', type: 'indicator', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' } as never,
    ]);

    const store2 = new StixCollectionStore(collections, objects);
    expect(await store2.getCollection(collection.id, TENANT_A)).toBeDefined();
    expect((await store2.getObjects(collection.id, TENANT_A, { page: 1, limit: 50 })).total).toBe(1);
    expect(await store2.getCollection(collection.id, TENANT_B)).toBeUndefined();

    expect(await store2.deleteCollection(collection.id, TENANT_A)).toBe(true);
    expect(await objects.get(collection.id, TENANT_A)).toBeNull();
  });

  it('export schedule + runs survive a restart; deleting a schedule deletes its runs; runs capped at 50', async () => {
    const schedules = new MemoryDocRepo<ExportSchedule>();
    const runs = new MemoryDocRepo<ExportRun>();
    const bulkExport = new BulkExportService(new StixExportService());
    const fetchRecords = async () => [{ id: 'x', type: 'ip', value: '1.1.1.1' }];
    const scheduler1 = new ExportScheduler(bulkExport, fetchRecords, schedules, runs);
    const schedule = await scheduler1.createSchedule(TENANT_A, scheduleInput);

    for (let i = 0; i < 55; i++) {
      await scheduler1.executeSchedule(schedule.id, TENANT_A);
    }

    const scheduler2 = new ExportScheduler(bulkExport, fetchRecords, schedules, runs);
    expect(await scheduler2.getSchedule(schedule.id, TENANT_A)).toBeDefined();
    expect(await scheduler2.getSchedule(schedule.id, TENANT_B)).toBeUndefined();

    const history = await scheduler2.getRunHistory(schedule.id, TENANT_A, { page: 1, limit: 100 });
    expect(history?.total).toBe(50); // capped

    expect(await scheduler2.deleteSchedule(schedule.id, TENANT_A)).toBe(true);
    const afterDelete = await runs.list(TENANT_A, schedule.id);
    expect(afterDelete).toHaveLength(0);
  });

  it('credential rotation record survives a restart and is scoped by integration + tenant', async () => {
    const repo = new MemoryDocRepo<CredentialRotationRecord>();
    const store = new IntegrationStore();
    const int = await store.createIntegration(TENANT_A, integrationInput);
    const rotation1 = new CredentialRotationService(store, null, repo);
    const record = await rotation1.rotate(int.id, TENANT_A, { newCredentials: { k: 'v' }, gracePeriodMinutes: 60 });

    const rotation2 = new CredentialRotationService(store, null, repo);
    const latest = await rotation2.getLatestRotation(int.id, TENANT_A);
    expect(latest?.id).toBe(record.id);
    expect(await rotation2.getLatestRotation(int.id, TENANT_B)).toBeNull();
  });

  it('audit entry survives a restart; cross-tenant getEntry returns undefined', async () => {
    const repo = new MemoryDocRepo<AuditEntry>();
    const trail1 = new AuditTrail(repo);
    const entry = await trail1.record({
      tenantId: TENANT_A, integrationId: null, action: 'rule.created', actor: 'user-1',
    });

    const trail2 = new AuditTrail(repo);
    expect(await trail2.getEntry(entry.id, TENANT_A)).toEqual(entry);
    expect(await trail2.getEntry(entry.id, TENANT_B)).toBeUndefined();
  });
});
