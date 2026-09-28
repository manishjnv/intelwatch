import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pino from 'pino';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { runGraphMigrations } from '../src/migrations/runner.js';
import { MIGRATIONS } from '../src/migrations/migrations.js';
import { NODE_TYPES } from '../src/schemas/graph.js';

function makeLogger(): pino.Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as pino.Logger;
}

function labelRecord(label: string) {
  return { get: (k: string) => (k === 'label' ? label : null) };
}

describe('graph migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runGraphMigrations (runner)', () => {
    it('skips already-applied ids and never runs migration bodies again', async () => {
      mockRun.mockImplementation((cypher: string) => {
        if (cypher.includes('MATCH (m:_GraphMigration')) {
          return Promise.resolve({ records: [{ get: () => 'x' }] }); // already applied
        }
        return Promise.resolve({ records: [] });
      });

      const result = await runGraphMigrations(makeLogger());

      expect(result.skipped).toEqual(MIGRATIONS.map((m) => m.id));
      expect(result.applied).toEqual([]);
      expect(mockRun.mock.calls.some((c) => String(c[0]).includes('db.labels'))).toBe(false);
      expect(mockRun.mock.calls.some((c) => String(c[0]).includes('MERGE (m:_GraphMigration'))).toBe(false);
    });

    it('applies all migrations, relabels only legacy lowercase labels, maps cve→Vulnerability, and records markers via MERGE', async () => {
      mockRun.mockImplementation((cypher: string) => {
        if (cypher.includes('MATCH (m:_GraphMigration')) return Promise.resolve({ records: [] }); // never applied
        if (cypher.includes('CALL db.labels()')) {
          return Promise.resolve({
            records: [
              labelRecord('cve'),
              labelRecord('domain'),
              labelRecord('IOC'),
              labelRecord('ThreatActor'),
              labelRecord('_GraphMigration'),
              labelRecord('Bad Label'),
              labelRecord('x;DROP'),
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      const result = await runGraphMigrations(makeLogger());

      expect(result.applied).toEqual(['001-relabel-legacy-ioc-labels', '002-constraints-and-indexes']);
      expect(result.skipped).toEqual([]);

      const relabelCalls = mockRun.mock.calls.filter((c) => String(c[0]).includes('IN TRANSACTIONS OF 1000 ROWS'));
      expect(relabelCalls).toHaveLength(2);

      const cveCall = relabelCalls.find((c) => String(c[0]).includes('`cve`'))!;
      expect(cveCall[1]).toMatchObject({ label: 'cve', target: 'Vulnerability' });

      const domainCall = relabelCalls.find((c) => String(c[0]).includes('`domain`'))!;
      expect(domainCall[1]).toMatchObject({ label: 'domain', target: 'IOC' });

      const mergeCalls = mockRun.mock.calls.filter((c) => String(c[0]).includes('MERGE (m:_GraphMigration'));
      expect(mergeCalls).toHaveLength(2);
      expect(mergeCalls.map((c) => (c[1] as Record<string, unknown>)['id'])).toEqual(MIGRATIONS.map((m) => m.id));
    });

    it('creates the migration-id uniqueness constraint before checking any migration', async () => {
      mockRun.mockResolvedValue({ records: [{ get: () => 'x' }] });

      await runGraphMigrations(makeLogger());

      const firstCall = String(mockRun.mock.calls[0]![0]);
      expect(firstCall).toContain('CREATE CONSTRAINT graph_migration_id IF NOT EXISTS');
    });
  });

  describe('001-relabel-legacy-ioc-labels (direct)', () => {
    it('ignores non-legacy labels (IOC, ThreatActor, _GraphMigration, and labels failing the regex)', async () => {
      const fakeRun = vi.fn().mockImplementation((cypher: string) => {
        if (cypher.includes('CALL db.labels()')) {
          return Promise.resolve({
            records: [
              labelRecord('IOC'),
              labelRecord('ThreatActor'),
              labelRecord('_GraphMigration'),
              labelRecord('Bad Label'),
              labelRecord('x;DROP'),
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });
      const migration = MIGRATIONS.find((m) => m.id === '001-relabel-legacy-ioc-labels')!;

      await migration.run({ run: fakeRun } as never, makeLogger());

      expect(fakeRun.mock.calls.some((c) => String(c[0]).includes('IN TRANSACTIONS OF 1000 ROWS'))).toBe(false);
    });

    it('leaves lowercase labels that are not IOC types untouched and warns', async () => {
      const fakeRun = vi.fn().mockImplementation((cypher: string) => {
        if (cypher.includes('CALL db.labels()')) {
          return Promise.resolve({ records: [labelRecord('foo'), labelRecord('ipv6')] });
        }
        return Promise.resolve({ records: [] });
      });
      const logger = makeLogger();
      const migration = MIGRATIONS.find((m) => m.id === '001-relabel-legacy-ioc-labels')!;

      await migration.run({ run: fakeRun } as never, logger);

      const relabels = fakeRun.mock.calls.filter((c) => String(c[0]).includes('IN TRANSACTIONS OF 1000 ROWS'));
      expect(relabels).toHaveLength(1);
      expect(relabels[0]![1]).toMatchObject({ label: 'ipv6', target: 'IOC' });
      expect(logger.warn).toHaveBeenCalledWith({ label: 'foo' }, expect.stringContaining('not an IOC type'));
    });
  });

  describe('002-constraints-and-indexes (direct)', () => {
    it('falls back to an index when the uniqueness constraint query rejects', async () => {
      const logger = makeLogger();
      const fakeRun = vi.fn().mockImplementation((cypher: string) => {
        if (cypher.includes('_id_tenant_unique')) {
          return Promise.reject(new Error('composite uniqueness constraints unsupported on this edition'));
        }
        return Promise.resolve({ records: [] });
      });
      const migration = MIGRATIONS.find((m) => m.id === '002-constraints-and-indexes')!;

      await migration.run({ run: fakeRun } as never, logger);

      const indexCalls = fakeRun.mock.calls.filter((c) => String(c[0]).includes('_id_tenant IF NOT EXISTS'));
      expect(indexCalls).toHaveLength(NODE_TYPES.length);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('creates uniqueness constraints for internal _GraphLock and _GraphSyncState labels', async () => {
      const fakeRun = vi.fn().mockResolvedValue({ records: [] });
      const migration = MIGRATIONS.find((m) => m.id === '002-constraints-and-indexes')!;

      await migration.run({ run: fakeRun } as never, makeLogger());

      const calls = fakeRun.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('_GraphLock') && c.includes('IS UNIQUE'))).toBe(true);
      expect(calls.some((c) => c.includes('_GraphSyncState') && c.includes('IS UNIQUE'))).toBe(true);
    });
  });
});
