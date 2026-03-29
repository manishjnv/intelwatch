/**
 * @module sso-repository
 * @description Prisma queries for SSO configuration (SsoConfig model).
 */
import { prisma } from './prisma.js';

/** Find SSO config for a tenant (1:1 relation) */
export async function findByTenantId(tenantId: string) {
  return prisma.ssoConfig.findUnique({ where: { tenantId } });
}

/** Find SSO config by SAML entityId (for callback lookup) */
export async function findByEntityId(entityId: string) {
  return prisma.ssoConfig.findFirst({ where: { entityId, enabled: true } });
}

/** Find SSO config by OIDC issuerUrl (for callback lookup) */
export async function findByIssuerUrl(issuerUrl: string) {
  return prisma.ssoConfig.findFirst({ where: { issuerUrl, enabled: true } });
}

/** Create or update SSO config for a tenant */
export async function upsert(
  tenantId: string,
  data: {
    provider: string;
    entityId?: string | null;
    metadataUrl?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
    issuerUrl?: string | null;
    certificate?: string | null;
    groupRoleMappings: unknown;
    approvedDomains: string[];
    enabled: boolean;
  }
) {
  return prisma.ssoConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      provider: data.provider,
      entityId: data.entityId ?? null,
      metadataUrl: data.metadataUrl ?? null,
      clientId: data.clientId ?? null,
      clientSecret: data.clientSecret ?? null,
      issuerUrl: data.issuerUrl ?? null,
      certificate: data.certificate ?? null,
      groupRoleMappings: data.groupRoleMappings as object,
      approvedDomains: data.approvedDomains,
      enabled: data.enabled,
    },
    update: {
      provider: data.provider,
      entityId: data.entityId ?? null,
      metadataUrl: data.metadataUrl ?? null,
      clientId: data.clientId ?? null,
      clientSecret: data.clientSecret ?? undefined,
      issuerUrl: data.issuerUrl ?? null,
      certificate: data.certificate ?? null,
      groupRoleMappings: data.groupRoleMappings as object,
      approvedDomains: data.approvedDomains,
      enabled: data.enabled,
    },
  });
}

/** Delete SSO config for a tenant */
export async function deleteByTenantId(tenantId: string) {
  return prisma.ssoConfig.delete({ where: { tenantId } });
}
