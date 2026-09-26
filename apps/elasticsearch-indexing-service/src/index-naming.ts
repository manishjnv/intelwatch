/**
 * Per-IOC-type index naming for Elasticsearch.
 *
 * Maps the 14 canonical IOC types to 6 index categories,
 * each with type-specific mappings optimised for that data shape.
 */

import { AppError } from '@etip/shared-utils';

/** Tenant ids go into index names/patterns; `*` or `,` would reach other tenants' indices. */
export function assertSafeTenantId(tenantId: string): string {
  if (!/^[a-z0-9-]{1,64}$/.test(tenantId)) {
    throw new AppError(400, 'Invalid tenantId', 'INVALID_TENANT_ID');
  }
  return tenantId;
}

/** The six index categories that IOC types map to. */
export type IndexCategory = 'ip' | 'domain' | 'hash' | 'email' | 'cve' | 'other';

/** Map every canonical IOC type string to its index category. */
const TYPE_TO_CATEGORY: Record<string, IndexCategory> = {
  ip:              'ip',
  ipv6:            'ip',
  cidr:            'ip',
  asn:             'ip',
  domain:          'domain',
  fqdn:            'domain',
  url:             'domain',
  md5:             'hash',
  sha1:            'hash',
  sha256:          'hash',
  sha512:          'hash',
  // Prisma IocType uses the hash_* prefix (prisma/schema.prisma) — the bare
  // names above are kept for backward compat with any existing docs/callers.
  hash_md5:        'hash',
  hash_sha1:       'hash',
  hash_sha256:     'hash',
  hash_sha512:     'hash',
  email:           'email',
  cve:             'cve',
  bitcoin_address: 'other',
  unknown:         'other',
};

/** All known index categories (useful for iteration). */
export const INDEX_CATEGORIES: readonly IndexCategory[] = ['ip', 'domain', 'hash', 'email', 'cve', 'other'] as const;

/**
 * Resolve the index category for a given IOC type.
 * Unknown types fall into the 'other' bucket.
 */
export function getIndexCategory(iocType: string): IndexCategory {
  return TYPE_TO_CATEGORY[iocType] ?? 'other';
}

/**
 * Return the per-type Elasticsearch index name for a tenant + IOC type.
 *
 * @example getTypeIndex('tenant-1', 'ip')      → 'etip_tenant-1_iocs_ip'
 * @example getTypeIndex('tenant-1', 'sha256')   → 'etip_tenant-1_iocs_hash'
 * @example getTypeIndex('tenant-1', 'unknown')  → 'etip_tenant-1_iocs_other'
 */
export function getTypeIndex(tenantId: string, iocType: string): string {
  const category = getIndexCategory(iocType);
  return `etip_${assertSafeTenantId(tenantId)}_iocs_${category}`;
}

/**
 * Return the wildcard index pattern that matches ALL per-type indices for a tenant.
 * Used for cross-type searches.
 *
 * @example getWildcardIndex('tenant-1') → 'etip_tenant-1_iocs_*'
 */
export function getWildcardIndex(tenantId: string): string {
  return `etip_${assertSafeTenantId(tenantId)}_iocs_*`;
}

/**
 * Return every per-type index name for a given tenant (all 6 categories).
 * Useful for stats aggregation and migration.
 */
export function getAllTypeIndices(tenantId: string): string[] {
  return INDEX_CATEGORIES.map((cat) => `etip_${tenantId}_iocs_${cat}`);
}
