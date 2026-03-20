/**
 * @module @etip/shared-types/stix
 * @description STIX 2.1 type mappings for bidirectional conversion between
 * ETIP canonical entities and STIX Domain Objects (SDOs) / Cyber Observables (SCOs).
 */
import { z } from 'zod';
import type { IocType } from './ioc.js';
import type { EntityType } from './intel.js';

/** STIX 2.1 SDO (STIX Domain Object) types we support */
export const STIX_SDO_TYPES = [
  'attack-pattern', 'campaign', 'course-of-action', 'grouping',
  'identity', 'indicator', 'infrastructure', 'intrusion-set',
  'location', 'malware', 'malware-analysis', 'note', 'observed-data',
  'opinion', 'report', 'threat-actor', 'tool', 'vulnerability',
] as const;
export const StixSdoTypeSchema = z.enum(STIX_SDO_TYPES);
export type StixSdoType = z.infer<typeof StixSdoTypeSchema>;

/** STIX 2.1 SCO (STIX Cyber Observable) types we support */
export const STIX_SCO_TYPES = [
  'autonomous-system', 'domain-name', 'email-addr', 'email-message',
  'file', 'ipv4-addr', 'ipv6-addr', 'mac-addr', 'network-traffic',
  'process', 'software', 'url', 'user-account',
  'windows-registry-key', 'x509-certificate',
] as const;
export const StixScoTypeSchema = z.enum(STIX_SCO_TYPES);
export type StixScoType = z.infer<typeof StixScoTypeSchema>;

/** STIX 2.1 Relationship Object */
export const STIX_RELATIONSHIP_TYPES = [
  'uses', 'targets', 'attributed-to', 'indicates', 'mitigates',
  'derived-from', 'variant-of', 'related-to', 'communicates-with',
  'consists-of', 'based-on', 'delivers', 'exploits',
] as const;
export const StixRelationshipTypeSchema = z.enum(STIX_RELATIONSHIP_TYPES);
export type StixRelationshipType = z.infer<typeof StixRelationshipTypeSchema>;

/**
 * Map ETIP IOC types → STIX SCO types.
 * Used when exporting ETIP data as STIX bundles.
 */
export const IOC_TO_STIX_SCO: Record<IocType, StixScoType | null> = {
  ip:              'ipv4-addr',
  ipv6:            'ipv6-addr',
  domain:          'domain-name',
  fqdn:            'domain-name',
  url:             'url',
  email:           'email-addr',
  md5:             'file',
  sha1:            'file',
  sha256:          'file',
  sha512:          'file',
  asn:             'autonomous-system',
  cidr:            'ipv4-addr',
  cve:             null,          // CVEs map to SDO 'vulnerability', not SCO
  bitcoin_address: null,          // No STIX SCO for crypto addresses
};

/**
 * Map ETIP entity types → STIX SDO types.
 * Used when exporting entities to STIX bundles.
 */
export const ENTITY_TO_STIX_SDO: Record<EntityType, StixSdoType> = {
  ioc:           'indicator',
  threat_actor:  'threat-actor',
  malware:       'malware',
  vulnerability: 'vulnerability',
};

/**
 * Map STIX SDO types → ETIP entity types (for import).
 * Only maps types we actively ingest.
 */
export const STIX_SDO_TO_ENTITY: Partial<Record<StixSdoType, EntityType>> = {
  'indicator':      'ioc',
  'threat-actor':   'threat_actor',
  'intrusion-set':  'threat_actor',
  'malware':        'malware',
  'vulnerability':  'vulnerability',
};

/** TLP to STIX marking-definition mapping */
export const TLP_TO_STIX_MARKING: Record<string, string> = {
  WHITE: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  GREEN: 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',
  AMBER: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
  RED:   'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed',
};

/** STIX bundle envelope */
export const StixBundleSchema = z.object({
  type: z.literal('bundle'),
  id: z.string().regex(/^bundle--[0-9a-f-]{36}$/),
  objects: z.array(z.record(z.string(), z.unknown())),
});
export type StixBundle = z.infer<typeof StixBundleSchema>;

/** STIX base object common properties */
export const StixBaseObjectSchema = z.object({
  type: z.string(),
  id: z.string(),
  spec_version: z.literal('2.1').default('2.1'),
  created: z.string().datetime(),
  modified: z.string().datetime(),
  created_by_ref: z.string().optional(),
  object_marking_refs: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  external_references: z.array(z.object({
    source_name: z.string(),
    url: z.string().url().optional(),
    external_id: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});
export type StixBaseObject = z.infer<typeof StixBaseObjectSchema>;
