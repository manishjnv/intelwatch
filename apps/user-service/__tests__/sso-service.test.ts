import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig } from '@etip/shared-auth';

// Mock Prisma
vi.mock('../src/prisma.js', () => ({
  prisma: {
    ssoConfig: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tenant: { findUnique: vi.fn() },
    session: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    mfaEnforcementPolicy: { findFirst: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'audit-1', ...args.data, createdAt: new Date() })) },
    })),
  },
  disconnectPrisma: vi.fn(),
}));

import { prisma } from '../src/prisma.js';
import { SsoService } from '../src/sso-service.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

process.env['TI_MFA_ENCRYPTION_KEY'] = 'test-mfa-encryption-key-at-least-32-chars!!';

const MOCK_TENANT_ID = '550e8400-e29b-41d4-a716-446655440010';
const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440020';
const IP = '127.0.0.1';
const UA = 'test-agent';

const baseSsoConfig = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  tenantId: MOCK_TENANT_ID,
  provider: 'oidc',
  entityId: null,
  metadataUrl: null,
  clientId: 'test-client-id',
  clientSecret: 'encrypted-secret-value',
  issuerUrl: 'https://idp.acme.com',
  certificate: null,
  groupRoleMappings: [
    { idpGroup: 'TI-Admins', role: 'tenant_admin' },
    { idpGroup: 'SOC-Team', role: 'analyst' },
    { idpGroup: 'SOC-Leads', role: 'analyst', designation: 'Lead' },
  ],
  approvedDomains: ['acme.com', 'acme.io'],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseTenant = {
  id: MOCK_TENANT_ID, name: 'ACME Corp', slug: 'acme', plan: 'enterprise',
  maxUsers: 50, active: true,
};

const baseUser = {
  id: MOCK_USER_ID, email: 'analyst@acme.com', displayName: 'Test Analyst',
  role: 'analyst', tenantId: MOCK_TENANT_ID, avatarUrl: null,
  active: true, designation: null, emailVerified: true,
  tenant: baseTenant,
};

describe('SsoService', () => {
  let service: SsoService;

  beforeAll(() => { loadJwtConfig(TEST_JWT_ENV); });
  beforeEach(() => {
    vi.clearAllMocks();
    service = new SsoService();
  });

  // ── 1. Get config — clientSecret redacted ──────────────────────

  it('returns SSO config with clientSecret redacted', async () => {
    vi.mocked(prisma.ssoConfig.findUnique).mockResolvedValue(baseSsoConfig as never);

    const result = await service.getConfig(MOCK_TENANT_ID);
    expect(result).toBeDefined();
    expect(result!.clientSecret).toBe('***');
    expect(result!.provider).toBe('oidc');
  });

  it('returns null when no SSO config exists', async () => {
    vi.mocked(prisma.ssoConfig.findUnique).mockResolvedValue(null as never);
    const result = await service.getConfig(MOCK_TENANT_ID);
    expect(result).toBeNull();
  });

  // ── 2. Invalid role mapping rejected ───────────────────────────

  it('rejects invalid role mapping (viewer not allowed)', async () => {
    const invalidInput = {
      provider: 'oidc',
      groupRoleMappings: [{ idpGroup: 'Viewers', role: 'viewer' }],
      approvedDomains: ['acme.com'],
    };
    await expect(service.upsertConfig(MOCK_TENANT_ID, invalidInput, MOCK_USER_ID, IP, UA))
      .rejects.toThrow();
  });

  it('rejects super_admin role mapping', async () => {
    const invalidInput = {
      provider: 'saml',
      groupRoleMappings: [{ idpGroup: 'Admins', role: 'super_admin' }],
      approvedDomains: ['acme.com'],
    };
    await expect(service.upsertConfig(MOCK_TENANT_ID, invalidInput, MOCK_USER_ID, IP, UA))
      .rejects.toThrow();
  });

  // ── 3. SSO callback — existing user, matching group ────────────

  it('assigns correct role from group mapping on callback', async () => {
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue(baseSsoConfig as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(baseUser as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue(baseUser as never);
    vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-1', refreshTokenHash: 'pending' } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null as never);

    const result = await service.handleCallback({
      email: 'analyst@acme.com',
      groups: ['SOC-Team'],
      displayName: 'Test Analyst',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA);

    expect(result.user.email).toBe('analyst@acme.com');
    expect(result.accessToken).toBeDefined();
  });

  // ── 4. SSO callback — new user JIT provisioned as analyst ──────

  it('JIT provisions new user as analyst by default', async () => {
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue(baseSsoConfig as never);
    // First findFirst for findUserByEmailAndTenant → null (new user)
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(baseTenant as never);
    vi.mocked(prisma.user.count).mockResolvedValue(5);
    const newUser = { ...baseUser, id: 'new-user-id', role: 'analyst' };
    vi.mocked(prisma.user.create).mockResolvedValue(newUser as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(newUser as never);
    vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-2', refreshTokenHash: 'pending' } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null as never);

    const result = await service.handleCallback({
      email: 'newuser@acme.com',
      groups: ['Unknown-Group'],
      displayName: 'New User',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA);

    expect(result.jitProvisioned).toBe(true);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  // ── 5. SSO callback — admin group → tenant_admin ───────────────

  it('maps admin IdP group to tenant_admin role', async () => {
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue(baseSsoConfig as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(baseTenant as never);
    vi.mocked(prisma.user.count).mockResolvedValue(5);
    const adminUser = { ...baseUser, role: 'tenant_admin' };
    vi.mocked(prisma.user.create).mockResolvedValue(adminUser as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as never);
    vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-3', refreshTokenHash: 'pending' } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null as never);

    await service.handleCallback({
      email: 'admin@acme.com',
      groups: ['TI-Admins'],
      displayName: 'Admin User',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA);

    const createCall = vi.mocked(prisma.user.create).mock.calls[0]![0] as { data: { role: string } };
    expect(createCall.data.role).toBe('tenant_admin');
  });

  // ── 6. Email domain not approved → rejected ────────────────────

  it('rejects SSO login when email domain not in approvedDomains', async () => {
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue(baseSsoConfig as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await expect(service.handleCallback({
      email: 'user@evil.com',
      groups: ['SOC-Team'],
      displayName: 'Evil User',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA)).rejects.toThrow('not approved');
  });

  // ── 7. Tenant at maxUsers → rejected ───────────────────────────

  it('rejects JIT provisioning when tenant at maxUsers limit', async () => {
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue(baseSsoConfig as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ ...baseTenant, maxUsers: 5 } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(5);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await expect(service.handleCallback({
      email: 'newuser@acme.com',
      groups: ['SOC-Team'],
      displayName: 'New User',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA)).rejects.toThrow('maximum user limit');
  });

  // ── 8. Disabled SSO → callback rejected ────────────────────────

  it('rejects callback when SSO is disabled', async () => {
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue({ ...baseSsoConfig, enabled: false } as never);

    await expect(service.handleCallback({
      email: 'analyst@acme.com',
      groups: ['SOC-Team'],
      displayName: 'Analyst',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA)).rejects.toThrow('disabled');
  });

  // ── 9. Group mapping change updates user role ──────────────────

  it('syncs updated role when group mapping changes', async () => {
    const existingUser = { ...baseUser, role: 'analyst', designation: null };
    vi.mocked(prisma.ssoConfig.findFirst).mockResolvedValue({
      ...baseSsoConfig,
      groupRoleMappings: [{ idpGroup: 'SOC-Team', role: 'tenant_admin' }],
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(existingUser as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...existingUser, role: 'tenant_admin' } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-4', refreshTokenHash: 'pending' } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null as never);

    await service.handleCallback({
      email: 'analyst@acme.com',
      groups: ['SOC-Team'],
      displayName: 'Test Analyst',
      issuerUrl: 'https://idp.acme.com',
    }, IP, UA);

    // updateUserSsoFields should have been called to sync role
    expect(prisma.user.update).toHaveBeenCalled();
  });

  // ── 10. Super admin views any tenant's SSO config ──────────────

  it('super admin can view any tenant SSO config', async () => {
    vi.mocked(prisma.ssoConfig.findUnique).mockResolvedValue(baseSsoConfig as never);
    const result = await service.getConfigForSuperAdmin(MOCK_TENANT_ID);
    expect(result).toBeDefined();
    expect(result!.clientSecret).toBe('***');
  });
});
