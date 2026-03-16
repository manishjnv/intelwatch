import { describe, it, expect } from 'vitest';
import {
  IocTypeSchema, CanonicalIOCSchema, IOC_TRANSITIONS, TlpSchema, ConfidenceInputsSchema,
  CanonicalThreatActorSchema, CanonicalMalwareSchema, CanonicalVulnerabilitySchema,
  NormalizedIntelSchema, PaginationQuerySchema, SortedPaginationQuerySchema,
  ErrorResponseSchema, HealthResponseSchema, DateRangeSchema,
  RoleSchema, TenantSchema, UserSchema, SafeUserSchema, CreateUserInputSchema,
  JwtPayloadSchema, AuditLogSchema, FeatureFlagSchema,
  FeedFetchPayloadSchema, NormalizePayloadSchema, EnrichRealtimePayloadSchema,
  GraphSyncPayloadSchema, ArchivePayloadSchema, ReportGeneratePayloadSchema,
  IOC_TO_STIX_SCO, ENTITY_TO_STIX_SDO, STIX_SDO_TO_ENTITY, TLP_TO_STIX_MARKING,
  StixBundleSchema, AI_MODELS, CACHE_TTL, PLATFORM_CONSTANTS,
  FeedConfigSchema, ModelConfigSchema,
} from '../src/index.js';

const NOW = new Date().toISOString();
const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('IocTypeSchema', () => {
  it('accepts all 14 types', () => {
    const types = ['ip','ipv6','domain','fqdn','url','email','md5','sha1','sha256','sha512','asn','cidr','cve','bitcoin_address'];
    for (const t of types) expect(IocTypeSchema.parse(t)).toBe(t);
  });
  it('rejects invalid', () => { expect(() => IocTypeSchema.parse('invalid')).toThrow(); });
});

describe('CanonicalIOCSchema', () => {
  const valid = {
    id: UUID, tenantId: 'tenant-1', type: 'ip' as const, value: '192.168.1.1',
    normalizedValue: '192.168.1.1', firstSeen: NOW, lastSeen: NOW,
    sourceRefs: [{ feedId: UUID, feedName: 'OTX' }], dedupeHash: 'a'.repeat(64),
    normalizedAt: NOW, schemaVersion: '3.0' as const,
  };
  it('accepts valid IOC', () => { expect(CanonicalIOCSchema.parse(valid).type).toBe('ip'); });
  it('applies defaults', () => {
    const r = CanonicalIOCSchema.parse(valid);
    expect(r.state).toBe('NEW'); expect(r.tlp).toBe('AMBER');
    expect(r.confidence).toBe(50); expect(r.severity).toBe('MEDIUM');
  });
  it('rejects missing fields', () => { expect(() => CanonicalIOCSchema.parse({})).toThrow(); });
  it('rejects bad confidence', () => { expect(() => CanonicalIOCSchema.parse({...valid, confidence: 150})).toThrow(); });
  it('rejects empty sourceRefs', () => { expect(() => CanonicalIOCSchema.parse({...valid, sourceRefs: []})).toThrow(); });
  it('rejects wrong schemaVersion', () => { expect(() => CanonicalIOCSchema.parse({...valid, schemaVersion: '2.0'})).toThrow(); });
});

describe('IOC_TRANSITIONS', () => {
  it('NEW -> ACTIVE|REVOKED', () => { expect(IOC_TRANSITIONS.NEW).toEqual(['ACTIVE', 'REVOKED']); });
  it('ARCHIVED is terminal', () => { expect(IOC_TRANSITIONS.ARCHIVED).toEqual([]); });
  it('AGING can re-activate', () => { expect(IOC_TRANSITIONS.AGING).toContain('ACTIVE'); });
});

describe('TlpSchema', () => {
  it('accepts valid', () => { for (const v of ['WHITE','GREEN','AMBER','RED']) expect(TlpSchema.parse(v)).toBe(v); });
  it('rejects invalid', () => { expect(() => TlpSchema.parse('PURPLE')).toThrow(); });
});

describe('ConfidenceInputsSchema', () => {
  it('validates', () => { expect(ConfidenceInputsSchema.parse({ feedReliability: 80, corroborationCount: 3, aiConfidence: 90, communityScore: 70, ageDays: 10 }).feedReliability).toBe(80); });
  it('rejects out-of-range', () => { expect(() => ConfidenceInputsSchema.parse({ feedReliability: 150, corroborationCount: 3, aiConfidence: 90, communityScore: 70, ageDays: 10 })).toThrow(); });
});

describe('Intel entities', () => {
  it('ThreatActor defaults', () => { const a = CanonicalThreatActorSchema.parse({ id: UUID, tenantId: 't', name: 'APT29', normalizedAt: NOW, schemaVersion: '3.0' }); expect(a.motivation).toBe('unknown'); });
  it('Malware type', () => { const m = CanonicalMalwareSchema.parse({ id: UUID, tenantId: 't', name: 'Emotet', malwareType: 'trojan', normalizedAt: NOW, schemaVersion: '3.0' }); expect(m.malwareType).toBe('trojan'); });
  it('Vuln CVE format', () => { const v = CanonicalVulnerabilitySchema.parse({ id: UUID, tenantId: 't', cveId: 'CVE-2024-12345', normalizedAt: NOW, schemaVersion: '3.0' }); expect(v.cveId).toBe('CVE-2024-12345'); });
  it('Vuln rejects bad CVE', () => { expect(() => CanonicalVulnerabilitySchema.parse({ id: UUID, tenantId: 't', cveId: 'NOT-A-CVE', normalizedAt: NOW, schemaVersion: '3.0' })).toThrow(); });
  it('NormalizedIntel wraps', () => { const i = NormalizedIntelSchema.parse({ entityType: 'ioc', entityId: UUID, tenantId: 't', data: {}, sourceRefs: [{ feedId: UUID, feedName: 'X' }], normalizedAt: NOW }); expect(i.enriched).toBe(false); });
});

describe('API schemas', () => {
  it('PaginationQuery defaults', () => { const r = PaginationQuerySchema.parse({}); expect(r.page).toBe(1); expect(r.limit).toBe(50); });
  it('coerces strings', () => { expect(PaginationQuerySchema.parse({ page: '3', limit: '25' }).page).toBe(3); });
  it('rejects limit > 500', () => { expect(() => PaginationQuerySchema.parse({ limit: 501 })).toThrow(); });
  it('SortedPagination defaults', () => { const r = SortedPaginationQuerySchema.parse({}); expect(r.sortBy).toBe('createdAt'); expect(r.sortDir).toBe('desc'); });
  it('ErrorResponse', () => { expect(ErrorResponseSchema.parse({ error: { code: 'X', message: 'Y' } }).error.code).toBe('X'); });
  it('HealthResponse', () => { expect(HealthResponseSchema.parse({ status: 'ok', service: 'x', version: '1', uptime: 0, timestamp: NOW }).status).toBe('ok'); });
  it('DateRange empty', () => { expect(DateRangeSchema.parse({}).from).toBeUndefined(); });
});

describe('User schemas', () => {
  it('RoleSchema', () => { for (const r of ['super_admin','tenant_admin','analyst','viewer','api_only']) expect(RoleSchema.parse(r)).toBe(r); });
  it('Tenant defaults', () => { const t = TenantSchema.parse({ id: UUID, name: 'Acme', slug: 'acme', createdAt: NOW, updatedAt: NOW }); expect(t.plan).toBe('free'); expect(t.maxUsers).toBe(5); });
  it('Tenant rejects bad slug', () => { expect(() => TenantSchema.parse({ id: UUID, name: 'X', slug: 'BAD!', createdAt: NOW, updatedAt: NOW })).toThrow(); });
  it('SafeUser strips secrets', () => { const u = SafeUserSchema.parse({ id: UUID, tenantId: UUID, email: 'a@b.com', displayName: 'A', role: 'analyst', authProvider: 'email', createdAt: NOW, updatedAt: NOW }); expect(u).not.toHaveProperty('passwordHash'); });
  it('CreateUser min password', () => { expect(() => CreateUserInputSchema.parse({ email: 'a@b.com', displayName: 'A', password: 'short' })).toThrow(); });
  it('CreateUser default role', () => { expect(CreateUserInputSchema.parse({ email: 'a@b.com', displayName: 'A' }).role).toBe('viewer'); });
  it('JwtPayload', () => { expect(JwtPayloadSchema.parse({ sub: UUID, tenantId: UUID, email: 'a@b.com', role: 'analyst', sessionId: UUID, iat: 1, exp: 2 }).role).toBe('analyst'); });
  it('AuditLog', () => { expect(AuditLogSchema.parse({ id: UUID, tenantId: UUID, userId: UUID, action: 'x', entityType: 'y', entityId: 'z', timestamp: NOW }).action).toBe('x'); });
  it('FeatureFlag defaults', () => { const f = FeatureFlagSchema.parse({ id: UUID, key: 'ai.v2', name: 'AI V2', createdAt: NOW, updatedAt: NOW }); expect(f.enabled).toBe(false); });
});

describe('Queue payloads', () => {
  it('FeedFetch', () => { expect(FeedFetchPayloadSchema.parse({ feedId: UUID, tenantId: 't', feedUrl: 'https://x.com/f', feedType: 'stix', scheduledAt: NOW }).feedType).toBe('stix'); });
  it('Normalize', () => { expect(NormalizePayloadSchema.parse({ tenantId: 't', feedId: UUID, feedName: 'X', entityType: 'ioc', rawEntity: {} }).entityType).toBe('ioc'); });
  it('EnrichRealtime default priority', () => { expect(EnrichRealtimePayloadSchema.parse({ tenantId: 't', entityType: 'ioc', entityId: UUID, value: '8.8.8.8' }).priority).toBe('normal'); });
  it('GraphSync ops', () => { for (const op of ['create','update','delete']) expect(GraphSyncPayloadSchema.parse({ tenantId: 't', entityType: 'ioc', entityId: UUID, operation: op }).operation).toBe(op); });
  it('Archive', () => { expect(ArchivePayloadSchema.parse({ tenantId: 't', entityType: 'ioc', entityIds: [UUID], reason: 'age' }).reason).toBe('age'); });
  it('Report default format', () => { expect(ReportGeneratePayloadSchema.parse({ tenantId: 't', reportType: 'weekly', dateRange: { from: NOW, to: NOW }, requestedBy: UUID }).format).toBe('pdf'); });
});

describe('STIX mappings', () => {
  it('ip -> ipv4-addr', () => { expect(IOC_TO_STIX_SCO.ip).toBe('ipv4-addr'); });
  it('sha256 -> file', () => { expect(IOC_TO_STIX_SCO.sha256).toBe('file'); });
  it('cve -> null', () => { expect(IOC_TO_STIX_SCO.cve).toBeNull(); });
  it('14 IOC mappings', () => { expect(Object.keys(IOC_TO_STIX_SCO)).toHaveLength(14); });
  it('entity SDO map', () => { expect(ENTITY_TO_STIX_SDO.ioc).toBe('indicator'); expect(ENTITY_TO_STIX_SDO.threat_actor).toBe('threat-actor'); });
  it('SDO reverse map', () => { expect(STIX_SDO_TO_ENTITY['indicator']).toBe('ioc'); });
  it('TLP markings', () => { expect(Object.keys(TLP_TO_STIX_MARKING)).toHaveLength(4); });
  it('StixBundle', () => { expect(StixBundleSchema.parse({ type: 'bundle', id: 'bundle--550e8400-e29b-41d4-a716-446655440000', objects: [] }).type).toBe('bundle'); });
});

describe('Config', () => {
  it('AI_MODELS', () => { expect(AI_MODELS.default).toBe('claude-sonnet-4-20250514'); expect(AI_MODELS.fast).toBe('claude-haiku-4-5-20251001'); });
  it('CACHE_TTL', () => { expect(CACHE_TTL.dashboard).toBe(172800); expect(CACHE_TTL.userSession).toBe(900); expect(CACHE_TTL.enrichment.hash).toBe(604800); });
  it('PLATFORM_CONSTANTS', () => { expect(PLATFORM_CONSTANTS.ARCHIVE_AFTER_DAYS).toBe(60); expect(PLATFORM_CONSTANTS.API_VERSION).toBe('v1'); });
  it('FeedConfig defaults', () => { const f = FeedConfigSchema.parse({ id: UUID, tenantId: UUID, name: 'OTX', url: 'https://x.com', feedType: 'json', createdAt: NOW, updatedAt: NOW }); expect(f.authType).toBe('none'); expect(f.enabled).toBe(true); });
  it('ModelConfig', () => { expect(ModelConfigSchema.parse({ modelId: 'x', displayName: 'X', costPer1kInput: 0.01, costPer1kOutput: 0.01 }).maxTokens).toBe(1000); });
});
