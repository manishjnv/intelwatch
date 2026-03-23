import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigPortability } from '../src/services/config-portability.js';

describe('ConfigPortability', () => {
  let portability: ConfigPortability;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    portability = new ConfigPortability();
    // Register mock stores
    portability.registerStore('modules', {
      get: () => ({ ingestion: { enabled: true }, hunting: { enabled: false } }),
      set: () => {},
    });
    portability.registerStore('ai', {
      get: () => ({ taskMappings: { triage: 'haiku' } }),
      set: () => {},
    });
  });

  describe('exportConfig', () => {
    it('exports all registered sections', () => {
      const payload = portability.exportConfig(TENANT);
      expect(payload.version).toBe('1.0');
      expect(payload.tenantId).toBe(TENANT);
      expect(payload.sections.modules).toBeDefined();
      expect(payload.sections.ai).toBeDefined();
    });

    it('exports specific sections only', () => {
      const payload = portability.exportConfig(TENANT, ['modules']);
      expect(payload.sections.modules).toBeDefined();
      expect(payload.sections.ai).toBeUndefined();
    });

    it('includes exportedAt timestamp', () => {
      const payload = portability.exportConfig(TENANT);
      expect(payload.exportedAt).toBeDefined();
    });
  });

  describe('importConfig', () => {
    it('imports config into registered stores', () => {
      let imported = false;
      portability.registerStore('modules', {
        get: () => ({}),
        set: () => { imported = true; },
      });

      const result = portability.importConfig(
        TENANT,
        {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          tenantId: TENANT,
          sections: { modules: { ingestion: { enabled: true } } },
        },
        false,
        'user-1',
      );

      expect(result.imported).toContain('modules');
      expect(imported).toBe(true);
    });

    it('skips sections without registered stores', () => {
      // 'risk' is a valid CONFIG_SECTION but we didn't register a store for it
      const result = portability.importConfig(
        TENANT,
        {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          tenantId: TENANT,
          sections: { risk: { ip: { weights: {} } } },
        },
        false,
        'user-1',
      );
      expect(result.skipped).toContain('risk');
    });

    it('merges config when merge=true', () => {
      let setArgs: Record<string, unknown> | null = null;
      portability.registerStore('modules', {
        get: () => ({ existing: true }),
        set: (_tid, data) => { setArgs = data; },
      });

      portability.importConfig(
        TENANT,
        {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          tenantId: TENANT,
          sections: { modules: { newKey: true } },
        },
        true,
        'user-1',
      );

      expect(setArgs).toEqual({ existing: true, newKey: true });
    });

    it('replaces config when merge=false', () => {
      let setArgs: Record<string, unknown> | null = null;
      portability.registerStore('modules', {
        get: () => ({ existing: true }),
        set: (_tid, data) => { setArgs = data; },
      });

      portability.importConfig(
        TENANT,
        {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          tenantId: TENANT,
          sections: { modules: { newKey: true } },
        },
        false,
        'user-1',
      );

      expect(setArgs).toEqual({ newKey: true });
    });
  });

  describe('validateImportPayload', () => {
    it('validates a correct payload', () => {
      const result = portability.validateImportPayload({
        version: '1.0',
        sections: { modules: {} },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing version', () => {
      const result = portability.validateImportPayload({
        sections: { modules: {} },
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing sections', () => {
      const result = portability.validateImportPayload({
        version: '1.0',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects unknown sections', () => {
      const result = portability.validateImportPayload({
        version: '1.0',
        sections: { invalid_section: {} },
      });
      expect(result.valid).toBe(false);
    });

    it('rejects non-object payload', () => {
      const result = portability.validateImportPayload(null);
      expect(result.valid).toBe(false);
    });
  });
});
