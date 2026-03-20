/**
 * @module @etip/shared-types/ioc
 * @description Zod schemas and TypeScript types for IOC entities.
 * Canonical IOC schema from 05-NORMALIZATION.md.
 */
import { z } from 'zod';

/** All 14 supported IOC types */
export const IOC_TYPES = [
  'ip', 'ipv6', 'domain', 'fqdn', 'url', 'email',
  'md5', 'sha1', 'sha256', 'sha512',
  'asn', 'cidr', 'cve', 'bitcoin_address',
] as const;

export const IocTypeSchema = z.enum(IOC_TYPES);
export type IocType = z.infer<typeof IocTypeSchema>;

/** TLP (Traffic Light Protocol) classification */
export const TLP_LEVELS = ['WHITE', 'GREEN', 'AMBER', 'RED'] as const;
export const TlpSchema = z.enum(TLP_LEVELS);
export type Tlp = z.infer<typeof TlpSchema>;

/** Severity levels for intelligence entities */
export const SEVERITY_LEVELS = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const SeveritySchema = z.enum(SEVERITY_LEVELS);
export type Severity = z.infer<typeof SeveritySchema>;

/** IOC lifecycle states (strict state machine — see 05-NORMALIZATION.md) */
export const IOC_STATES = [
  'NEW', 'ACTIVE', 'AGING', 'EXPIRED',
  'ARCHIVED', 'FALSE_POSITIVE', 'REVOKED',
] as const;
export const IocStateSchema = z.enum(IOC_STATES);
export type IocState = z.infer<typeof IocStateSchema>;

/** Valid IOC state transitions */
export const IOC_TRANSITIONS: Record<IocState, readonly IocState[]> = {
  NEW:            ['ACTIVE', 'REVOKED'],
  ACTIVE:         ['AGING', 'FALSE_POSITIVE', 'REVOKED'],
  AGING:          ['EXPIRED', 'ACTIVE'],
  EXPIRED:        ['ARCHIVED', 'ACTIVE'],
  ARCHIVED:       [],
  FALSE_POSITIVE: ['ARCHIVED'],
  REVOKED:        ['ARCHIVED'],
} as const;

/** Automatic state transition timing rules */
export const IOC_AUTO_TRANSITIONS = {
  NEW_TO_ACTIVE_AFTER_ENRICHMENT: true,
  ACTIVE_TO_AGING_DAYS: 30,
  AGING_TO_EXPIRED_DAYS: 60,
  EXPIRED_TO_ARCHIVED_DAYS: 90,
} as const;

/** Source reference for feed provenance */
export const SourceRefSchema = z.object({
  feedId: z.string(),
  feedName: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * Canonical IOC schema — the single source of truth for IOC data shape.
 * Every IOC in the system MUST conform to this schema after normalization.
 */
export const CanonicalIOCSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  type: IocTypeSchema,
  value: z.string().min(1),
  normalizedValue: z.string().min(1),
  state: IocStateSchema.default('NEW'),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  tlp: TlpSchema.default('AMBER'),
  confidence: z.number().min(0).max(100).default(50),
  severity: SeveritySchema.default('MEDIUM'),
  tags: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  malwareFamilies: z.array(z.string()).default([]),
  threatActors: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRefSchema).min(1),
  dedupeHash: z.string().length(64),
  rawData: z.unknown().optional(),
  normalizedAt: z.string().datetime(),
  schemaVersion: z.literal('3.0'),
});
export type CanonicalIOC = z.infer<typeof CanonicalIOCSchema>;

/** Input schema for creating an IOC (before normalization assigns id/hash) */
export const CreateIOCInputSchema = CanonicalIOCSchema.omit({
  id: true,
  dedupeHash: true,
  normalizedValue: true,
  normalizedAt: true,
  schemaVersion: true,
  state: true,
}).extend({
  value: z.string().min(1),
});
export type CreateIOCInput = z.infer<typeof CreateIOCInputSchema>;

/** Composite confidence formula inputs */
export const ConfidenceInputsSchema = z.object({
  feedReliability: z.number().min(0).max(100),
  corroborationCount: z.number().int().min(0),
  aiConfidence: z.number().min(0).max(100),
  communityScore: z.number().min(0).max(100),
  ageDays: z.number().min(0),
});
export type ConfidenceInputs = z.infer<typeof ConfidenceInputsSchema>;
