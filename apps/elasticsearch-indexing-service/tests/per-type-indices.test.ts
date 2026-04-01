import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTypeIndex,
  getWildcardIndex,
  getIndexCategory,
  getAllTypeIndices,
  INDEX_CATEGORIES,
} from '../src/index-naming.js';
import {
  getCommonProperties,
  getCategoryProperties,
  buildMappingForCategory,
  buildIndexBody,
  INDEX_SETTINGS,
} from '../src/mappings.js';
import {
  ILM_POLICY_NAME,
  ILM_POLICY_BODY,
  INDEX_TEMPLATE_NAME,
  buildIndexTemplateBody,
} from '../src/ilm.js';

// ── Index Naming ─────────────────────────────────────────────────────────────

describe('index-naming', () => {
  describe('getIndexCategory', () => {
    it('maps ip to ip category', () => {
      expect(getIndexCategory('ip')).toBe('ip');
    });
    it('maps ipv6 to ip category', () => {
      expect(getIndexCategory('ipv6')).toBe('ip');
    });
    it('maps cidr to ip category', () => {
      expect(getIndexCategory('cidr')).toBe('ip');
    });
    it('maps asn to ip category', () => {
      expect(getIndexCategory('asn')).toBe('ip');
    });
    it('maps domain to domain category', () => {
      expect(getIndexCategory('domain')).toBe('domain');
    });
    it('maps fqdn to domain category', () => {
      expect(getIndexCategory('fqdn')).toBe('domain');
    });
    it('maps url to domain category', () => {
      expect(getIndexCategory('url')).toBe('domain');
    });
    it('maps md5 to hash category', () => {
      expect(getIndexCategory('md5')).toBe('hash');
    });
    it('maps sha1 to hash category', () => {
      expect(getIndexCategory('sha1')).toBe('hash');
    });
    it('maps sha256 to hash category', () => {
      expect(getIndexCategory('sha256')).toBe('hash');
    });
    it('maps sha512 to hash category', () => {
      expect(getIndexCategory('sha512')).toBe('hash');
    });
    it('maps email to email category', () => {
      expect(getIndexCategory('email')).toBe('email');
    });
    it('maps cve to cve category', () => {
      expect(getIndexCategory('cve')).toBe('cve');
    });
    it('maps bitcoin_address to other category', () => {
      expect(getIndexCategory('bitcoin_address')).toBe('other');
    });
    it('maps unknown types to other category', () => {
      expect(getIndexCategory('some_future_type')).toBe('other');
    });
  });

  describe('getTypeIndex', () => {
    it('returns correct index for ip type', () => {
      expect(getTypeIndex('tenant-1', 'ip')).toBe('etip_tenant-1_iocs_ip');
    });
    it('returns correct index for sha256 → hash', () => {
      expect(getTypeIndex('tenant-1', 'sha256')).toBe('etip_tenant-1_iocs_hash');
    });
    it('returns correct index for domain type', () => {
      expect(getTypeIndex('tenant-1', 'domain')).toBe('etip_tenant-1_iocs_domain');
    });
    it('returns correct index for cve type', () => {
      expect(getTypeIndex('tenant-1', 'cve')).toBe('etip_tenant-1_iocs_cve');
    });
    it('returns other index for unknown types', () => {
      expect(getTypeIndex('tenant-1', 'xyz')).toBe('etip_tenant-1_iocs_other');
    });
  });

  describe('getWildcardIndex', () => {
    it('returns wildcard pattern for cross-type search', () => {
      expect(getWildcardIndex('tenant-1')).toBe('etip_tenant-1_iocs_*');
    });
  });

  describe('getAllTypeIndices', () => {
    it('returns 6 index names (one per category)', () => {
      const indices = getAllTypeIndices('tenant-1');
      expect(indices).toHaveLength(6);
      expect(indices).toContain('etip_tenant-1_iocs_ip');
      expect(indices).toContain('etip_tenant-1_iocs_domain');
      expect(indices).toContain('etip_tenant-1_iocs_hash');
      expect(indices).toContain('etip_tenant-1_iocs_email');
      expect(indices).toContain('etip_tenant-1_iocs_cve');
      expect(indices).toContain('etip_tenant-1_iocs_other');
    });
  });

  describe('INDEX_CATEGORIES', () => {
    it('contains all 6 categories', () => {
      expect(INDEX_CATEGORIES).toEqual(['ip', 'domain', 'hash', 'email', 'cve', 'other']);
    });
  });
});

// ── Mappings ─────────────────────────────────────────────────────────────────

describe('mappings', () => {
  describe('getCommonProperties', () => {
    it('includes value, type, severity, confidence, tenantId', () => {
      const props = getCommonProperties();
      expect(props.value).toBeDefined();
      expect(props.type).toBeDefined();
      expect(props.severity).toBeDefined();
      expect(props.confidence).toBeDefined();
      expect(props.tenantId).toBeDefined();
    });

    it('includes normalizedValue as keyword', () => {
      const props = getCommonProperties();
      expect(props.normalizedValue).toEqual({ type: 'keyword' });
    });

    it('includes lifecycle, tlp, tags, mitreAttack fields', () => {
      const props = getCommonProperties();
      expect(props.lifecycle).toBeDefined();
      expect(props.tlp).toBeDefined();
      expect(props.tags).toBeDefined();
      expect(props.mitreAttack).toBeDefined();
    });

    it('includes malwareFamilies and threatActors', () => {
      const props = getCommonProperties();
      expect(props.malwareFamilies).toBeDefined();
      expect(props.threatActors).toBeDefined();
    });
  });

  describe('getCategoryProperties', () => {
    it('returns geo, asn, orgName, country, isScanner, abuseScore for ip', () => {
      const props = getCategoryProperties('ip');
      expect(props.geo).toEqual({ type: 'geo_point' });
      expect(props.asn).toEqual({ type: 'keyword' });
      expect(props.orgName).toBeDefined();
      expect(props.country).toEqual({ type: 'keyword' });
      expect(props.isScanner).toEqual({ type: 'boolean' });
      expect(props.abuseScore).toEqual({ type: 'integer' });
    });

    it('returns registrar, whoisCreated, isCdn, isPhishing, safeBrowsingVerdict for domain', () => {
      const props = getCategoryProperties('domain');
      expect(props.registrar).toEqual({ type: 'keyword' });
      expect(props.whoisCreated).toEqual({ type: 'date' });
      expect(props.isCdn).toEqual({ type: 'boolean' });
      expect(props.isPhishing).toEqual({ type: 'boolean' });
      expect(props.safeBrowsingVerdict).toEqual({ type: 'keyword' });
    });

    it('returns fileType, fileSize, avDetections, avTotal, signatureNames for hash', () => {
      const props = getCategoryProperties('hash');
      expect(props.fileType).toEqual({ type: 'keyword' });
      expect(props.fileSize).toEqual({ type: 'long' });
      expect(props.avDetections).toEqual({ type: 'integer' });
      expect(props.avTotal).toEqual({ type: 'integer' });
      expect(props.signatureNames).toEqual({ type: 'keyword' });
    });

    it('returns cvssScore, epssScore, epssPercentile, isKEV, exploitStatus for cve', () => {
      const props = getCategoryProperties('cve');
      expect(props.cvssScore).toEqual({ type: 'float' });
      expect(props.epssScore).toEqual({ type: 'float' });
      expect(props.epssPercentile).toEqual({ type: 'float' });
      expect(props.isKEV).toEqual({ type: 'boolean' });
      expect(props.exploitStatus).toEqual({ type: 'keyword' });
    });

    it('returns empty object for email category', () => {
      expect(getCategoryProperties('email')).toEqual({});
    });

    it('returns empty object for other category', () => {
      expect(getCategoryProperties('other')).toEqual({});
    });
  });

  describe('buildMappingForCategory', () => {
    it('merges common + category fields for ip', () => {
      const mapping = buildMappingForCategory('ip');
      expect(mapping.mappings.properties.value).toBeDefined();
      expect(mapping.mappings.properties.geo).toEqual({ type: 'geo_point' });
    });
  });

  describe('buildIndexBody', () => {
    it('includes settings with shard/replica/refresh', () => {
      const body = buildIndexBody('ip');
      expect(body.settings.number_of_shards).toBe(1);
      expect(body.settings.number_of_replicas).toBe(1);
      expect(body.settings.refresh_interval).toBe('5s');
    });

    it('includes mappings for the category', () => {
      const body = buildIndexBody('hash');
      expect(body.mappings.properties.fileType).toBeDefined();
      expect(body.mappings.properties.value).toBeDefined();
    });
  });

  describe('INDEX_SETTINGS', () => {
    it('has 1 shard and 1 replica', () => {
      expect(INDEX_SETTINGS.number_of_shards).toBe(1);
      expect(INDEX_SETTINGS.number_of_replicas).toBe(1);
    });
  });
});

// ── ILM ──────────────────────────────────────────────────────────────────────

describe('ilm', () => {
  describe('ILM_POLICY_BODY', () => {
    it('has 4 phases: hot, warm, cold, delete', () => {
      const phases = ILM_POLICY_BODY.policy.phases;
      expect(phases.hot).toBeDefined();
      expect(phases.warm).toBeDefined();
      expect(phases.cold).toBeDefined();
      expect(phases.delete).toBeDefined();
    });

    it('hot phase has 0ms min_age', () => {
      expect(ILM_POLICY_BODY.policy.phases.hot.min_age).toBe('0ms');
    });

    it('warm phase starts at 7d with forcemerge + readonly', () => {
      const warm = ILM_POLICY_BODY.policy.phases.warm;
      expect(warm.min_age).toBe('7d');
      expect(warm.actions.forcemerge).toEqual({ max_num_segments: 1 });
      expect(warm.actions.readonly).toEqual({});
    });

    it('warm phase sets 0 replicas', () => {
      expect(ILM_POLICY_BODY.policy.phases.warm.actions.allocate).toEqual({ number_of_replicas: 0 });
    });

    it('cold phase starts at 30d with freeze', () => {
      const cold = ILM_POLICY_BODY.policy.phases.cold;
      expect(cold.min_age).toBe('30d');
      expect(cold.actions.freeze).toEqual({});
    });

    it('delete phase starts at 90d', () => {
      expect(ILM_POLICY_BODY.policy.phases.delete.min_age).toBe('90d');
      expect(ILM_POLICY_BODY.policy.phases.delete.actions.delete).toEqual({});
    });
  });

  describe('ILM_POLICY_NAME', () => {
    it('is etip-ioc-lifecycle', () => {
      expect(ILM_POLICY_NAME).toBe('etip-ioc-lifecycle');
    });
  });

  describe('INDEX_TEMPLATE_NAME', () => {
    it('is etip-ioc-template', () => {
      expect(INDEX_TEMPLATE_NAME).toBe('etip-ioc-template');
    });
  });

  describe('buildIndexTemplateBody', () => {
    it('matches etip_*_iocs_* pattern', () => {
      const body = buildIndexTemplateBody();
      expect(body.index_patterns).toEqual(['etip_*_iocs_*']);
    });

    it('includes ILM policy in settings', () => {
      const body = buildIndexTemplateBody();
      const settings = (body.template as Record<string, unknown>).settings as Record<string, unknown>;
      expect(settings['index.lifecycle.name']).toBe('etip-ioc-lifecycle');
    });

    it('includes common properties in mappings', () => {
      const body = buildIndexTemplateBody();
      const mappings = (body.template as Record<string, unknown>).mappings as Record<string, unknown>;
      const props = (mappings as { properties: Record<string, unknown> }).properties;
      expect(props.value).toBeDefined();
      expect(props.tenantId).toBeDefined();
    });

    it('has priority 100', () => {
      expect(buildIndexTemplateBody().priority).toBe(100);
    });
  });
});
