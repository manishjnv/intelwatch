import { describe, it, expect, beforeEach } from 'vitest';
import { BulkImport } from '../src/services/bulk-import.js';
import { HuntSessionManager } from '../src/services/hunt-session-manager.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #14 Bulk Import', () => {
  let store: HuntingStore;
  let manager: HuntSessionManager;
  let importer: BulkImport;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  let huntId: string;

  beforeEach(() => {
    store = new HuntingStore();
    manager = new HuntSessionManager(store, { sessionTimeoutHours: 72, maxActiveSessions: 20 });
    importer = new BulkImport(manager);

    const hunt = manager.create(tenantId, userId, {
      title: 'Import Test',
      hypothesis: 'Testing bulk import',
    });
    huntId = hunt.id;
  });

  // ─── CSV Parsing ──────────────────────────────────────

  it('14.1. parses CSV with header', () => {
    const csv = 'type,value,notes\nip,10.0.0.1,C2 server\ndomain,evil.com,Phishing';
    const rows = importer.parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.type).toBe('ip');
    expect(rows[0]!.value).toBe('10.0.0.1');
    expect(rows[0]!.notes).toBe('C2 server');
  });

  it('14.2. parses CSV without header', () => {
    const csv = 'ip,10.0.0.1\ndomain,evil.com';
    const rows = importer.parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it('14.3. handles quoted CSV fields', () => {
    const csv = '"type","value","notes"\nip,"10.0.0.1","Server, main"';
    const rows = importer.parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('14.4. skips empty lines', () => {
    const csv = 'ip,10.0.0.1\n\n\ndomain,evil.com\n';
    const rows = importer.parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  // ─── STIX Parsing ─────────────────────────────────────

  it('14.5. parses STIX indicator objects', () => {
    const stix = {
      objects: [
        { type: 'indicator', pattern: "[ipv4-addr:value = '10.0.0.1']", name: 'C2 IP' },
        { type: 'indicator', pattern: "[domain-name:value = 'evil.com']" },
        { type: 'report', name: 'Not an indicator' },
      ],
    };
    const rows = importer.parseStixIndicators(stix);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.type).toBe('ip');
    expect(rows[0]!.value).toBe('10.0.0.1');
    expect(rows[1]!.type).toBe('domain');
  });

  it('14.6. parses STIX SHA-256 pattern', () => {
    const stix = {
      objects: [
        { type: 'indicator', pattern: "[file:hashes.'SHA-256' = 'abc123']" },
      ],
    };
    const rows = importer.parseStixIndicators(stix);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('hash_sha256');
  });

  it('14.7. skips unparseable STIX patterns', () => {
    const stix = {
      objects: [
        { type: 'indicator', pattern: "[unknown:value = 'x']" },
      ],
    };
    const rows = importer.parseStixIndicators(stix);
    expect(rows).toHaveLength(0);
  });

  // ─── Import Execution ─────────────────────────────────

  it('14.8. imports valid entities', () => {
    const rows = [
      { type: 'ip', value: '10.0.0.1' },
      { type: 'domain', value: 'evil.com' },
    ];
    const result = importer.importCsv(tenantId, huntId, userId, rows);
    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('14.9. rejects invalid entity types', () => {
    const rows = [
      { type: 'invalid_type', value: 'test' },
    ];
    const result = importer.importCsv(tenantId, huntId, userId, rows);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain('Invalid entity type');
  });

  it('14.10. rejects empty values', () => {
    const rows = [
      { type: 'ip', value: '' },
    ];
    const result = importer.importCsv(tenantId, huntId, userId, rows);
    expect(result.skipped).toBe(1);
  });

  it('14.11. reports mixed results', () => {
    const rows = [
      { type: 'ip', value: '10.0.0.1' },
      { type: 'bad', value: 'x' },
      { type: 'domain', value: 'evil.com' },
      { type: 'ip', value: '' },
    ];
    const result = importer.importCsv(tenantId, huntId, userId, rows);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it('14.12. end-to-end CSV parse + import', () => {
    const csv = 'type,value,notes\nip,10.0.0.1,C2\ndomain,evil.com,Phishing\ncve,CVE-2024-1234,Critical';
    const rows = importer.parseCsv(csv);
    const result = importer.importCsv(tenantId, huntId, userId, rows);
    expect(result.imported).toBe(3);

    const session = manager.get(tenantId, huntId);
    expect(session.entities).toHaveLength(3);
  });
});
