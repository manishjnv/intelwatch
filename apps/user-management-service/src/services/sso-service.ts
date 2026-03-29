import { AppError } from '@etip/shared-utils';
import type { SamlConfig, OidcConfig } from '../schemas/user-management.js';

/** Tenant SSO configuration. */
export interface TenantSsoConfig {
  tenantId: string;
  saml: SamlConfig | null;
  oidc: OidcConfig | null;
  updatedAt: string;
  updatedBy: string;
}

/** SSO connection test result. */
export interface SsoTestResult {
  provider: 'saml' | 'oidc';
  reachable: boolean;
  certificateValid: boolean | null;
  error: string | null;
  testedAt: string;
}

/**
 * In-memory SSO configuration service.
 * Manages per-tenant SAML 2.0 and OIDC configuration.
 */
export class SsoService {
  private configs = new Map<string, TenantSsoConfig>();

  /** Get SSO config for a tenant. */
  getConfig(tenantId: string): TenantSsoConfig | null {
    return this.configs.get(tenantId) ?? null;
  }

  /** Configure SAML 2.0 for a tenant. */
  configureSaml(tenantId: string, config: SamlConfig, updatedBy: string): TenantSsoConfig {
    this.validateAllowedDomains(config.allowedDomains);

    const existing = this.configs.get(tenantId);
    const updated: TenantSsoConfig = {
      tenantId,
      saml: config,
      oidc: existing?.oidc ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.configs.set(tenantId, updated);
    return updated;
  }

  /** Configure OIDC for a tenant. */
  configureOidc(tenantId: string, config: OidcConfig, updatedBy: string): TenantSsoConfig {
    this.validateAllowedDomains(config.allowedDomains);

    const existing = this.configs.get(tenantId);
    const updated: TenantSsoConfig = {
      tenantId,
      saml: existing?.saml ?? null,
      oidc: config,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.configs.set(tenantId, updated);
    return updated;
  }

  /** Disable all SSO for a tenant. */
  disableSso(tenantId: string): void {
    this.configs.delete(tenantId);
  }

  /** Test SSO connection for a tenant (simulated in-memory). */
  testConnection(tenantId: string): SsoTestResult {
    const config = this.configs.get(tenantId);
    if (!config) {
      throw new AppError(404, 'SSO not configured for this tenant', 'SSO_NOT_CONFIGURED');
    }

    if (config.saml?.enabled) {
      return {
        provider: 'saml',
        reachable: this.isValidUrl(config.saml.ssoUrl),
        certificateValid: config.saml.certificate.length > 0,
        error: null,
        testedAt: new Date().toISOString(),
      };
    }

    if (config.oidc?.enabled) {
      return {
        provider: 'oidc',
        reachable: this.isValidUrl(config.oidc.issuerUrl),
        certificateValid: null,
        error: null,
        testedAt: new Date().toISOString(),
      };
    }

    throw new AppError(400, 'No SSO provider is enabled', 'SSO_NOT_ENABLED');
  }

  /** Check if a user email is allowed to SSO into a tenant. */
  isEmailAllowed(tenantId: string, email: string): boolean {
    const config = this.configs.get(tenantId);
    if (!config) return false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    const samlDomains = config.saml?.enabled ? config.saml.allowedDomains : [];
    const oidcDomains = config.oidc?.enabled ? config.oidc.allowedDomains : [];
    const allDomains = [...samlDomains, ...oidcDomains].map((d) => d.toLowerCase());

    return allDomains.includes(domain);
  }

  /** Check if JIT provisioning is enabled for a tenant. */
  isJitEnabled(tenantId: string): boolean {
    const config = this.configs.get(tenantId);
    if (!config) return false;
    return (config.saml?.enabled && config.saml.jitProvisioning) ||
           (config.oidc?.enabled && config.oidc.jitProvisioning) || false;
  }

  /** Get the default role for JIT-provisioned users. */
  getJitDefaultRole(tenantId: string): string {
    const config = this.configs.get(tenantId);
    if (!config) return 'analyst';
    if (config.saml?.enabled && config.saml.jitProvisioning) return config.saml.defaultRole;
    if (config.oidc?.enabled && config.oidc.jitProvisioning) return config.oidc.defaultRole;
    return 'analyst';
  }

  private validateAllowedDomains(domains: string[]): void {
    for (const d of domains) {
      if (!d.includes('.') || d.startsWith('.') || d.endsWith('.')) {
        throw new AppError(400, `Invalid domain: '${d}'`, 'INVALID_DOMAIN');
      }
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
