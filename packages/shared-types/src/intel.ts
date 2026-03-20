/**
 * @module @etip/shared-types/intel
 * @description Schemas for threat actors, malware, vulnerabilities, and
 * the generic NormalizedIntel wrapper used across the pipeline.
 */
import { z } from 'zod';
import { TlpSchema, SeveritySchema, SourceRefSchema } from './ioc.js';

/** Threat actor motivation categories */
export const ACTOR_MOTIVATIONS = [
  'financial', 'espionage', 'hacktivism', 'sabotage',
  'ideology', 'unknown',
] as const;

/** Threat actor sophistication levels */
export const ACTOR_SOPHISTICATION = [
  'none', 'minimal', 'intermediate', 'advanced', 'expert', 'strategic',
] as const;

/** Canonical Threat Actor schema */
export const CanonicalThreatActorSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(''),
  motivation: z.enum(ACTOR_MOTIVATIONS).default('unknown'),
  sophistication: z.enum(ACTOR_SOPHISTICATION).default('none'),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
  country: z.string().optional(),
  targetSectors: z.array(z.string()).default([]),
  targetRegions: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  associatedMalware: z.array(z.string()).default([]),
  associatedIOCs: z.array(z.string()).default([]),
  tlp: TlpSchema.default('AMBER'),
  confidence: z.number().min(0).max(100).default(50),
  tags: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRefSchema).default([]),
  normalizedAt: z.string().datetime(),
  schemaVersion: z.literal('3.0'),
});
export type CanonicalThreatActor = z.infer<typeof CanonicalThreatActorSchema>;

/** Canonical Malware schema */
export const CanonicalMalwareSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(''),
  malwareType: z.enum([
    'ransomware', 'trojan', 'worm', 'backdoor', 'rat', 'rootkit',
    'keylogger', 'stealer', 'botnet', 'loader', 'dropper',
    'cryptominer', 'wiper', 'adware', 'spyware', 'other',
  ]).default('other'),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
  platforms: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  associatedActors: z.array(z.string()).default([]),
  associatedIOCs: z.array(z.string()).default([]),
  tlp: TlpSchema.default('AMBER'),
  confidence: z.number().min(0).max(100).default(50),
  tags: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRefSchema).default([]),
  normalizedAt: z.string().datetime(),
  schemaVersion: z.literal('3.0'),
});
export type CanonicalMalware = z.infer<typeof CanonicalMalwareSchema>;

/** CVSS severity string levels */
export const CVSS_SEVERITY = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Canonical Vulnerability schema */
export const CanonicalVulnerabilitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  cveId: z.string().regex(/^CVE-\d{4}-\d{4,}$/i),
  description: z.string().default(''),
  cvssScore: z.number().min(0).max(10).optional(),
  cvssSeverity: z.enum(CVSS_SEVERITY).optional(),
  cvssVector: z.string().optional(),
  epssScore: z.number().min(0).max(1).optional(),
  cweId: z.string().optional(),
  affectedProducts: z.array(z.string()).default([]),
  exploitedInWild: z.boolean().default(false),
  patchAvailable: z.boolean().default(false),
  publishedDate: z.string().datetime().optional(),
  lastModifiedDate: z.string().datetime().optional(),
  mitreAttack: z.array(z.string()).default([]),
  associatedMalware: z.array(z.string()).default([]),
  associatedActors: z.array(z.string()).default([]),
  tlp: TlpSchema.default('AMBER'),
  confidence: z.number().min(0).max(100).default(50),
  severity: SeveritySchema.default('MEDIUM'),
  tags: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRefSchema).default([]),
  normalizedAt: z.string().datetime(),
  schemaVersion: z.literal('3.0'),
});
export type CanonicalVulnerability = z.infer<typeof CanonicalVulnerabilitySchema>;

/** Entity categories flowing through the pipeline */
export const ENTITY_TYPES = [
  'ioc', 'threat_actor', 'malware', 'vulnerability',
] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * NormalizedIntel — generic wrapper for any intelligence entity
 * flowing through the pipeline (normalize → enrich → store).
 */
export const NormalizedIntelSchema = z.object({
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  tenantId: z.string().min(1),
  data: z.unknown(),
  sourceRefs: z.array(SourceRefSchema),
  normalizedAt: z.string().datetime(),
  enriched: z.boolean().default(false),
  enrichedAt: z.string().datetime().optional(),
});
export type NormalizedIntel = z.infer<typeof NormalizedIntelSchema>;
