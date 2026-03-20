/**
 * @module @etip/shared-types/tests/user-queue-stix-config
 * @description Unit tests for User, Queue payload, STIX mapping, and Config schemas.
 */
import { describe, it, expect } from 'vitest';
import {
  // User
  RoleSchema,
  TenantSchema,
  UserSchema,
  SafeUserSchema,
  CreateUserInputSchema,
  JwtPayloadSchema,
  AuditLogSchema,
  FeatureFlagSchema,
  // Queue
  FeedFetchPayloadSchema,
  NormalizePayloadSchema,
  EnrichRealtimePayloadSchema,
  GraphSyncPayloadSchema,
  ArchivePayloadSchema,
  ReportGeneratePayloadSchema,
  // STIX
  IOC_TO_STIX_SCO,
  ENTITY_TO_STIX_SDO,
  STIX_SDO_TO_ENTITY,
  TLP_TO_STIX_MARKING,
  StixBundleSchema,
  // Config
  AI_MODELS,
  CACHE_TTL,
  PLATFORM_CONSTANTS,
  FeedConfigSchema,
  EnvConfigSchema,
  ModelConfigSchema,
} from '../src/index.js';

const NOW = new Date().toISOString();
const UUID = '550e8400-e29b-41d4-a716-446655440000';

// ── User & Tenant Tests ────────────────────────────────────────────

describe('RoleSchema', () => {
  it('accepts all valid roles', () => {
    for (const r of ['super_admin', 'tenant_admin', 'analyst', 'viewer', 'api_only']) {
      expect(RoleSchema.parse(r)).toBe(r);
    }
  });
  it('rejects unknown role', () => {
    expect(() => RoleSchema.parse('hacker')).toThrow();
  });
});

describe('TenantSchema', () => {
  it('validates tenant with defaults', () => {
    const tenant = TenantSchema.parse({
      id: UUID,
      name: 'Acme Corp',
      slug: 'acme-corp',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(tenant.plan).toBe('free');
    expect(tenant.maxUsers).toBe(5);
    expect(tenant.maxIOCs).toBe(10000);
    expect(tenant.active).toBe(true);
  });

  it('rejects invalid slug characters', () => {
    expect(() => TenantSchema.parse({
      id: UUID, name: 'Test', slug: 'UPPER_CASE!',
      createdAt: NOW, updatedAt: NOW,
    })).toThrow();
  });
});

describe('UserSchema / SafeUserSchema', () => {
  const validUser = {
    id: UUID,
    tenantId: UUID,
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'analyst' as const,
    authProvider: 'email' as const,
    passwordHash: '$2b$10$hash',
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('validates a full user', () => {
    const user = UserSchema.parse(validUser);
    expect(user.email).toBe('test@example.com');
    expect(user.mfaEnabled).toBe(false);
  });

  it('SafeUser strips password and mfa secret', () => {
    const safe = SafeUserSchema.parse(validUser);
    expect(safe).not.toHaveProperty('passwordHash');
    expect(safe).not.toHaveProperty('mfaSecret');
  });
});

describe('CreateUserInputSchema', () => {
  it('requires minimum 12-char password', () => {
    expect(() => CreateUserInputSchema.parse({
      email: 'a@b.com', displayName: 'A', password: 'short',
    })).toThrow();
  });

  it('defaults role to viewer', () => {
    const result = CreateUserInputSchema.parse({
      email: 'a@b.com', displayName: 'A',
    });
    expect(result.role).toBe('viewer');
  });
});

describe('JwtPayloadSchema', () => {
  it('validates JWT payload', () => {
    const payload = JwtPayloadSchema.parse({
      sub: UUID, tenantId: UUID, email: 'a@b.com',
      role: 'analyst', sessionId: UUID,
      iat: 1700000000, exp: 1700001000,
    });
    expect(payload.role).toBe('analyst');
  });
});

describe('AuditLogSchema', () => {
  it('validates audit log entry', () => {
    const log = AuditLogSchema.parse({
      id: UUID, tenantId: UUID, userId: UUID,
      action: 'ioc.created', entityType: 'ioc', entityId: UUID,
      timestamp: NOW,
    });
    expect(log.action).toBe('ioc.created');
  });
});

describe('FeatureFlagSchema', () => {
  it('validates feature flag', () => {
    const flag = FeatureFlagSchema.parse({
      id: UUID, key: 'ai.enrichment.v2', name: 'AI Enrichment V2',
      createdAt: NOW, updatedAt: NOW,
    });
    expect(flag.enabled).toBe(false);
    expect(flag.rolloutPercentage).toBe(0);
  });

  it('rejects key with invalid chars', () => {
    expect(() => FeatureFlagSchema.parse({
      id: UUID, key: 'UPPER CASE!', name: 'Bad',
      createdAt: NOW, updatedAt: NOW,
    })).toThrow();
  });
});

// ── Queue Payload Tests ────────────────────────────────────────────

describe('FeedFetchPayloadSchema', () => {
  it('validates feed fetch payload', () => {
    const result = FeedFetchPayloadSchema.parse({
      feedId: UUID, tenantId: 'tenant-1',
      feedUrl: 'https://example.com/feed',
      feedType: 'stix', scheduledAt: NOW,
    });
    expect(result.feedType).toBe('stix');
  });
});

describe('NormalizePayloadSchema', () => {
  it('validates normalize payload', () => {
    const result = NormalizePayloadSchema.parse({
      tenantId: 'tenant-1', feedId: UUID, feedName: 'OTX',
      entityType: 'ioc', rawEntity: { value: '8.8.8.8' },
    });
    expect(result.entityType).toBe('ioc');
  });
});

describe('EnrichRealtimePayloadSchema', () => {
  it('applies default priority', () => {
    const result = EnrichRealtimePayloadSchema.parse({
      tenantId: 'tenant-1', entityType: 'ioc',
      entityId: UUID, value: '8.8.8.8',
    });
    expect(result.priority).toBe('normal');
  });
});

describe('GraphSyncPayloadSchema', () => {
  it('validates graph sync operations', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      const result = GraphSyncPayloadSchema.parse({
        tenantId: 'tenant-1', entityType: 'ioc',
        entityId: UUID, operation: op,
      });
      expect(result.operation).toBe(op);
    }
  });
});

describe('ArchivePayloadSchema', () => {
  it('validates archive payload', () => {
    const result = ArchivePayloadSchema.parse({
      tenantId: 'tenant-1', entityType: 'ioc',
      entityIds: [UUID], reason: 'age',
    });
    expect(result.reason).toBe('age');
  });
});

describe('ReportGeneratePayloadSchema', () => {
  it('defaults format to pdf', () => {
    const result = ReportGeneratePayloadSchema.parse({
      tenantId: 'tenant-1', reportType: 'weekly',
      dateRange: { from: NOW, to: NOW },
      requestedBy: UUID,
    });
    expect(result.format).toBe('pdf');
  });
});

// ── STIX Mapping Tests ─────────────────────────────────────────────

describe('IOC_TO_STIX_SCO mappings', () => {
  it('maps ip to ipv4-addr', () => {
    expect(IOC_TO_STIX_SCO.ip).toBe('ipv4-addr');
  });
  it('maps sha256 to file', () => {
    expect(IOC_TO_STIX_SCO.sha256).toBe('file');
  });
  it('maps cve to null (SDO, not SCO)', () => {
    expect(IOC_TO_STIX_SCO.cve).toBeNull();
  });
  it('maps all 14 IOC types', () => {
    expect(Object.keys(IOC_TO_STIX_SCO)).toHaveLength(14);
  });
});

describe('ENTITY_TO_STIX_SDO', () => {
  it('maps all 4 entity types', () => {
    expect(ENTITY_TO_STIX_SDO.ioc).toBe('indicator');
    expect(ENTITY_TO_STIX_SDO.threat_actor).toBe('threat-actor');
    expect(ENTITY_TO_STIX_SDO.malware).toBe('malware');
    expect(ENTITY_TO_STIX_SDO.vulnerability).toBe('vulnerability');
  });
});

describe('STIX_SDO_TO_ENTITY', () => {
  it('maps indicator back to ioc', () => {
    expect(STIX_SDO_TO_ENTITY['indicator']).toBe('ioc');
  });
  it('maps intrusion-set to threat_actor', () => {
    expect(STIX_SDO_TO_ENTITY['intrusion-set']).toBe('threat_actor');
  });
});

describe('TLP_TO_STIX_MARKING', () => {
  it('has marking definitions for all 4 TLP levels', () => {
    expect(Object.keys(TLP_TO_STIX_MARKING)).toHaveLength(4);
    for (const v of Object.values(TLP_TO_STIX_MARKING)) {
      expect(v).toMatch(/^marking-definition--/);
    }
  });
});

describe('StixBundleSchema', () => {
  it('validates a STIX bundle', () => {
    const bundle = StixBundleSchema.parse({
      type: 'bundle',
      id: 'bundle--550e8400-e29b-41d4-a716-446655440000',
      objects: [{ type: 'indicator', id: 'indicator--1234' }],
    });
    expect(bundle.objects).toHaveLength(1);
  });
});

// ── Config Tests ───────────────────────────────────────────────────

describe('AI_MODELS', () => {
  it('has correct model IDs', () => {
    expect(AI_MODELS.default).toBe('claude-sonnet-4-20250514');
    expect(AI_MODELS.fast).toBe('claude-haiku-4-5-20251001');
    expect(AI_MODELS.heavy).toBe('claude-opus-4-6');
  });
});

describe('CACHE_TTL', () => {
  it('dashboard is 48 hours', () => {
    expect(CACHE_TTL.dashboard).toBe(48 * 3600);
  });
  it('user session is 15 min', () => {
    expect(CACHE_TTL.userSession).toBe(900);
  });
  it('enrichment hash is 7 days', () => {
    expect(CACHE_TTL.enrichment.hash).toBe(604800);
  });
});

describe('PLATFORM_CONSTANTS', () => {
  it('has correct values', () => {
    expect(PLATFORM_CONSTANTS.ARCHIVE_AFTER_DAYS).toBe(60);
    expect(PLATFORM_CONSTANTS.MAX_FILE_LINES).toBe(400);
    expect(PLATFORM_CONSTANTS.API_VERSION).toBe('v1');
    expect(PLATFORM_CONSTANTS.DEFAULT_PAGE_LIMIT).toBe(50);
    expect(PLATFORM_CONSTANTS.MAX_PAGE_LIMIT).toBe(500);
  });
});

describe('FeedConfigSchema', () => {
  it('applies defaults', () => {
    const feed = FeedConfigSchema.parse({
      id: UUID, tenantId: UUID, name: 'OTX',
      url: 'https://otx.alienvault.com/api/v1/pulses',
      feedType: 'json', createdAt: NOW, updatedAt: NOW,
    });
    expect(feed.authType).toBe('none');
    expect(feed.enabled).toBe(true);
    expect(feed.reliability).toBe(50);
    expect(feed.defaultTlp).toBe('AMBER');
    expect(feed.lastStatus).toBe('pending');
  });
});

describe('ModelConfigSchema', () => {
  it('validates model config', () => {
    const config = ModelConfigSchema.parse({
      modelId: AI_MODELS.default,
      displayName: 'Claude Sonnet',
      costPer1kInput: 0.003,
      costPer1kOutput: 0.015,
    });
    expect(config.maxTokens).toBe(1000);
    expect(config.temperature).toBe(0.1);
  });
});
