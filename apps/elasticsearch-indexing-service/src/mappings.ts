/**
 * Elasticsearch index mappings for per-IOC-type indices.
 *
 * Common fields are shared across all index categories.
 * Each category adds type-specific fields (geo for IP, AV for hash, etc.).
 */

import type { IndexCategory } from './index-naming.js';

type EsFieldDef = Record<string, unknown>;
type MappingProperties = Record<string, EsFieldDef>;

// ── Common fields (all indices) ──────────────────────────────────────────────

const COMMON_PROPERTIES: MappingProperties = {
  iocId:           { type: 'keyword' },
  value:           { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
  normalizedValue: { type: 'keyword' },
  type:            { type: 'keyword' },
  severity:        { type: 'keyword' },
  confidence:      { type: 'integer' },
  lifecycle:       { type: 'keyword' },
  tlp:             { type: 'keyword' },
  tags:            { type: 'text', fields: { keyword: { type: 'keyword' } } },
  mitreAttack:     { type: 'keyword' },
  malwareFamilies: { type: 'keyword' },
  threatActors:    { type: 'keyword' },
  firstSeen:       { type: 'date' },
  lastSeen:        { type: 'date' },
  tenantId:        { type: 'keyword' },
  sourceId:        { type: 'keyword' },
  enriched:        { type: 'boolean' },
  campaignIds:     { type: 'keyword' },
  actorIds:        { type: 'keyword' },
};

// ── Per-category extra fields ────────────────────────────────────────────────

const IP_PROPERTIES: MappingProperties = {
  geo:         { type: 'geo_point' },
  asn:         { type: 'keyword' },
  orgName:     { type: 'text', fields: { keyword: { type: 'keyword' } } },
  country:     { type: 'keyword' },
  isScanner:   { type: 'boolean' },
  abuseScore:  { type: 'integer' },
};

const DOMAIN_PROPERTIES: MappingProperties = {
  registrar:            { type: 'keyword' },
  whoisCreated:         { type: 'date' },
  isCdn:                { type: 'boolean' },
  isPhishing:           { type: 'boolean' },
  safeBrowsingVerdict:  { type: 'keyword' },
};

const HASH_PROPERTIES: MappingProperties = {
  fileType:       { type: 'keyword' },
  fileSize:       { type: 'long' },
  avDetections:   { type: 'integer' },
  avTotal:        { type: 'integer' },
  signatureNames: { type: 'keyword' },
};

const CVE_PROPERTIES: MappingProperties = {
  cvssScore:      { type: 'float' },
  epssScore:      { type: 'float' },
  epssPercentile: { type: 'float' },
  isKEV:          { type: 'boolean' },
  exploitStatus:  { type: 'keyword' },
};

/** Extra fields for each index category. Email and Other have no extras. */
const CATEGORY_PROPERTIES: Record<IndexCategory, MappingProperties> = {
  ip:     IP_PROPERTIES,
  domain: DOMAIN_PROPERTIES,
  hash:   HASH_PROPERTIES,
  cve:    CVE_PROPERTIES,
  email:  {},
  other:  {},
};

// ── Public API ───────────────────────────────────────────────────────────────

/** Return the common mapping properties shared by all IOC indices. */
export function getCommonProperties(): MappingProperties {
  return { ...COMMON_PROPERTIES };
}

/** Return the extra mapping properties for a specific index category. */
export function getCategoryProperties(category: IndexCategory): MappingProperties {
  return { ...CATEGORY_PROPERTIES[category] };
}

/**
 * Build the complete mapping for a given index category.
 * Merges common fields + category-specific fields.
 */
export function buildMappingForCategory(category: IndexCategory): { mappings: { properties: MappingProperties } } {
  return {
    mappings: {
      properties: {
        ...COMMON_PROPERTIES,
        ...CATEGORY_PROPERTIES[category],
      },
    },
  };
}

/** Default index settings for all IOC indices. */
export const INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 1,
  refresh_interval: '5s',
} as const;

/**
 * Build the full index body (settings + mappings) for a given category.
 * Used by ensureTypeIndex to create indices with correct schema.
 */
export function buildIndexBody(category: IndexCategory): {
  settings: typeof INDEX_SETTINGS;
  mappings: { properties: MappingProperties };
} {
  return {
    settings: { ...INDEX_SETTINGS },
    ...buildMappingForCategory(category),
  };
}
