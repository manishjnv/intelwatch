import { describe, it, expect, beforeEach } from 'vitest';
import { SsoService } from '../src/services/sso-service.js';

describe('SsoService', () => {
  let service: SsoService;
  const TENANT = 'tenant-1';
  const ADMIN = 'admin-1';

  const validSaml = {
    enabled: true,
    entityId: 'https://idp.example.com/metadata',
    ssoUrl: 'https://idp.example.com/sso',
    certificate: 'MIIC...base64cert',
    signatureAlgorithm: 'sha256' as const,
    nameIdFormat: 'email' as const,
    allowedDomains: ['example.com'],
    jitProvisioning: true,
    defaultRole: 'analyst',
  };

  const validOidc = {
    enabled: true,
    issuerUrl: 'https://accounts.google.com',
    clientId: 'client-123',
    clientSecret: 'secret-456',
    scopes: ['openid', 'profile', 'email'],
    allowedDomains: ['acme.com'],
    jitProvisioning: true,
    defaultRole: 'analyst',
  };

  beforeEach(() => {
    service = new SsoService();
  });

  describe('SAML configuration', () => {
    it('stores SAML config for a tenant', () => {
      const config = service.configureSaml(TENANT, validSaml, ADMIN);
      expect(config.saml?.enabled).toBe(true);
      expect(config.saml?.entityId).toBe(validSaml.entityId);
    });

    it('preserves existing OIDC when configuring SAML', () => {
      service.configureOidc(TENANT, validOidc, ADMIN);
      const config = service.configureSaml(TENANT, validSaml, ADMIN);
      expect(config.oidc?.enabled).toBe(true);
      expect(config.saml?.enabled).toBe(true);
    });

    it('rejects invalid domain', () => {
      expect(() => service.configureSaml(TENANT, { ...validSaml, allowedDomains: ['.bad'] }, ADMIN)).toThrow('Invalid domain');
    });
  });

  describe('OIDC configuration', () => {
    it('stores OIDC config for a tenant', () => {
      const config = service.configureOidc(TENANT, validOidc, ADMIN);
      expect(config.oidc?.enabled).toBe(true);
      expect(config.oidc?.issuerUrl).toBe(validOidc.issuerUrl);
    });
  });

  describe('SSO management', () => {
    it('returns null for unconfigured tenant', () => {
      expect(service.getConfig('unknown')).toBeNull();
    });

    it('disables SSO', () => {
      service.configureSaml(TENANT, validSaml, ADMIN);
      service.disableSso(TENANT);
      expect(service.getConfig(TENANT)).toBeNull();
    });

    it('tests SAML connection', () => {
      service.configureSaml(TENANT, validSaml, ADMIN);
      const result = service.testConnection(TENANT);
      expect(result.provider).toBe('saml');
      expect(result.reachable).toBe(true);
    });

    it('tests OIDC connection', () => {
      service.configureOidc(TENANT, validOidc, ADMIN);
      const result = service.testConnection(TENANT);
      expect(result.provider).toBe('oidc');
      expect(result.reachable).toBe(true);
    });

    it('throws when testing unconfigured SSO', () => {
      expect(() => service.testConnection(TENANT)).toThrow('not configured');
    });
  });

  describe('Email domain checking', () => {
    it('allows email from configured domain', () => {
      service.configureSaml(TENANT, validSaml, ADMIN);
      expect(service.isEmailAllowed(TENANT, 'user@example.com')).toBe(true);
    });

    it('rejects email from unconfigured domain', () => {
      service.configureSaml(TENANT, validSaml, ADMIN);
      expect(service.isEmailAllowed(TENANT, 'user@other.com')).toBe(false);
    });

    it('returns false for unconfigured tenant', () => {
      expect(service.isEmailAllowed('unknown', 'user@any.com')).toBe(false);
    });
  });

  describe('JIT provisioning', () => {
    it('returns true when SAML JIT enabled', () => {
      service.configureSaml(TENANT, validSaml, ADMIN);
      expect(service.isJitEnabled(TENANT)).toBe(true);
    });

    it('returns correct default role', () => {
      service.configureSaml(TENANT, validSaml, ADMIN);
      expect(service.getJitDefaultRole(TENANT)).toBe('analyst');
    });

    it('returns false when not configured', () => {
      expect(service.isJitEnabled(TENANT)).toBe(false);
    });
  });
});
