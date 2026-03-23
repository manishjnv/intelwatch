import { describe, it, expect } from 'vitest';
import { StixExportService } from '../src/services/stix-export.js';

describe('StixExportService', () => {
  const service = new StixExportService();
  const TENANT = 'tenant-1';

  describe('getDiscovery', () => {
    it('returns discovery with api_roots', () => {
      const disc = service.getDiscovery('https://api.example.com');
      expect(disc.title).toBe('ETIP TAXII Server');
      expect(disc.api_roots).toHaveLength(1);
      expect(disc.default).toContain('taxii/api1');
    });
  });

  describe('getCollections', () => {
    it('returns IOC and alert collections', () => {
      const result = service.getCollections(TENANT);
      expect(result.collections).toHaveLength(2);
      expect(result.collections[0].canRead).toBe(true);
      expect(result.collections[0].canWrite).toBe(false);
      expect(result.collections[0].mediaTypes).toContain('application/stix+json;version=2.1');
    });

    it('includes tenant ID in collection IDs', () => {
      const result = service.getCollections(TENANT);
      expect(result.collections[0].id).toContain(TENANT);
    });
  });

  describe('iocToStixBundle', () => {
    it('creates a valid STIX 2.1 bundle', () => {
      const iocs = [
        { id: 'ioc-1', type: 'ip', value: '1.2.3.4', severity: 'high', confidence: 85 },
        { id: 'ioc-2', type: 'domain', value: 'evil.com', severity: 'critical', confidence: 95 },
      ];
      const bundle = service.iocToStixBundle(iocs, TENANT);
      expect(bundle.type).toBe('bundle');
      expect(bundle.id).toMatch(/^bundle--/);
      // identity + 2 indicators
      expect(bundle.objects).toHaveLength(3);
    });

    it('creates identity object as first entry', () => {
      const bundle = service.iocToStixBundle([], TENANT);
      expect(bundle.objects[0].type).toBe('identity');
      expect(bundle.objects[0].name).toBe('ETIP Platform');
    });

    it('converts IP to STIX indicator pattern', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'ip', value: '1.2.3.4' }],
        TENANT,
      );
      const indicator = bundle.objects[1];
      expect(indicator.type).toBe('indicator');
      expect(indicator.pattern).toBe("[ipv4-addr:value = '1.2.3.4']");
      expect(indicator.pattern_type).toBe('stix');
    });

    it('converts domain to STIX indicator pattern', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'domain', value: 'evil.com' }],
        TENANT,
      );
      expect(bundle.objects[1].pattern).toBe("[domain-name:value = 'evil.com']");
    });

    it('converts SHA-256 to STIX indicator pattern', () => {
      const hash = 'a'.repeat(64);
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'sha256', value: hash }],
        TENANT,
      );
      expect(bundle.objects[1].pattern).toBe(`[file:hashes.'SHA-256' = '${hash}']`);
    });

    it('converts URL to STIX indicator pattern', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'url', value: 'https://evil.com/malware' }],
        TENANT,
      );
      expect(bundle.objects[1].pattern).toBe("[url:value = 'https://evil.com/malware']");
    });

    it('converts email to STIX indicator pattern', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'email', value: 'phish@evil.com' }],
        TENANT,
      );
      expect(bundle.objects[1].pattern).toBe("[email-addr:value = 'phish@evil.com']");
    });

    it('handles hash_sha256 type alias', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'hash_sha256', value: 'b'.repeat(64) }],
        TENANT,
      );
      expect(bundle.objects[1].pattern).toContain("SHA-256");
    });

    it('skips unknown IOC types', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'unknown_type', value: 'test' }],
        TENANT,
      );
      expect(bundle.objects).toHaveLength(1); // only identity
    });

    it('includes confidence and severity TLP', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'ip', value: '1.2.3.4', confidence: 90, severity: 'critical' }],
        TENANT,
      );
      const indicator = bundle.objects[1];
      expect(indicator.confidence).toBe(90);
      expect(indicator.object_marking_refs).toBeDefined();
    });

    it('preserves tags as labels', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'ip', value: '1.2.3.4', tags: ['apt', 'ransomware'] }],
        TENANT,
      );
      expect(bundle.objects[1].labels).toEqual(['apt', 'ransomware']);
    });

    it('sets spec_version 2.1 on all objects', () => {
      const bundle = service.iocToStixBundle(
        [{ id: '1', type: 'ip', value: '1.2.3.4' }],
        TENANT,
      );
      for (const obj of bundle.objects) {
        expect(obj.spec_version).toBe('2.1');
      }
    });
  });

  describe('alertToStixSighting', () => {
    it('creates a valid sighting', () => {
      const sighting = service.alertToStixSighting({
        id: 'alert-1',
        title: 'High severity alert',
        severity: 'high',
        createdAt: '2026-01-01T00:00:00Z',
      }, TENANT);

      expect(sighting.type).toBe('sighting');
      expect(sighting.spec_version).toBe('2.1');
      expect(sighting.confidence).toBe(80);
      expect(sighting.where_sighted_refs).toContain(`identity--${TENANT}`);
    });

    it('links to indicator when indicatorIds provided', () => {
      const sighting = service.alertToStixSighting({
        id: 'alert-1',
        title: 'Test',
        severity: 'medium',
        createdAt: '2026-01-01T00:00:00Z',
        indicatorIds: ['ioc-42'],
      }, TENANT);

      expect(sighting.sighting_of_ref).toBe('indicator--ioc-42');
    });
  });
});
