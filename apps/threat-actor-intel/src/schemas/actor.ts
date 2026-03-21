import { z } from 'zod';

/** Valid actor type values matching Prisma ActorType enum. */
export const ACTOR_TYPES = ['nation_state', 'criminal', 'hacktivist', 'insider', 'competitor', 'unknown'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Valid motivation values matching Prisma ActorMotivation enum. */
export const ACTOR_MOTIVATIONS = ['financial', 'espionage', 'hacktivism', 'sabotage', 'ideology', 'unknown'] as const;
export type ActorMotivation = (typeof ACTOR_MOTIVATIONS)[number];

/** Valid sophistication values matching Prisma ActorSophistication enum. */
export const ACTOR_SOPHISTICATIONS = ['none', 'minimal', 'intermediate', 'advanced', 'expert', 'strategic'] as const;
export type ActorSophistication = (typeof ACTOR_SOPHISTICATIONS)[number];

/** Valid TLP values matching Prisma TLP enum. */
export const TLP_VALUES = ['white', 'green', 'amber', 'red'] as const;

/** Valid sort fields for actor listing. */
export const SORT_FIELDS = ['name', 'confidence', 'actorType', 'motivation', 'sophistication', 'firstSeen', 'lastSeen', 'createdAt', 'updatedAt'] as const;

/** Valid sort directions. */
export const SORT_ORDERS = ['asc', 'desc'] as const;

/** MITRE ATT&CK technique ID pattern (e.g., T1059, T1059.001). */
const MitreTechniqueId = z.string().regex(/^T\d{4}(\.\d{3})?$/, 'Invalid MITRE ATT&CK technique ID (e.g., T1059 or T1059.001)');

/** Schema for listing actors with pagination and filters. */
export const ListActorsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(SORT_FIELDS).default('name'),
  sortOrder: z.enum(SORT_ORDERS).default('asc'),
  actorType: z.enum(ACTOR_TYPES).optional(),
  motivation: z.enum(ACTOR_MOTIVATIONS).optional(),
  sophistication: z.enum(ACTOR_SOPHISTICATIONS).optional(),
  country: z.string().min(1).optional(),
  active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  tag: z.string().min(1).optional(),
});
export type ListActorsInput = z.infer<typeof ListActorsSchema>;

/** Schema for creating a new threat actor profile. */
export const CreateActorSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  aliases: z.array(z.string().min(1).max(255).trim()).max(50).default([]),
  description: z.string().max(5000).default(''),
  actorType: z.enum(ACTOR_TYPES).default('unknown'),
  motivation: z.enum(ACTOR_MOTIVATIONS).default('unknown'),
  sophistication: z.enum(ACTOR_SOPHISTICATIONS).default('none'),
  country: z.string().min(1).max(100).trim().optional(),
  targetSectors: z.array(z.string().min(1).max(100).trim()).max(50).default([]),
  targetRegions: z.array(z.string().min(1).max(100).trim()).max(50).default([]),
  ttps: z.array(MitreTechniqueId).max(200).default([]),
  associatedMalware: z.array(z.string().min(1).max(255).trim()).max(100).default([]),
  tlp: z.enum(TLP_VALUES).default('amber'),
  confidence: z.number().int().min(0).max(100).default(50),
  tags: z.array(z.string().min(1).max(100).trim()).max(50).default([]),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
});
export type CreateActorInput = z.infer<typeof CreateActorSchema>;

/** Schema for updating an existing threat actor profile. All fields optional. */
export const UpdateActorSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  aliases: z.array(z.string().min(1).max(255).trim()).max(50).optional(),
  description: z.string().max(5000).optional(),
  actorType: z.enum(ACTOR_TYPES).optional(),
  motivation: z.enum(ACTOR_MOTIVATIONS).optional(),
  sophistication: z.enum(ACTOR_SOPHISTICATIONS).optional(),
  country: z.string().min(1).max(100).trim().nullable().optional(),
  targetSectors: z.array(z.string().min(1).max(100).trim()).max(50).optional(),
  targetRegions: z.array(z.string().min(1).max(100).trim()).max(50).optional(),
  ttps: z.array(MitreTechniqueId).max(200).optional(),
  associatedMalware: z.array(z.string().min(1).max(255).trim()).max(100).optional(),
  tlp: z.enum(TLP_VALUES).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().min(1).max(100).trim()).max(50).optional(),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
});
export type UpdateActorInput = z.infer<typeof UpdateActorSchema>;

/** Schema for full-text search across actors. */
export const SearchActorsSchema = z.object({
  q: z.string().min(1).max(500).trim(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  actorType: z.enum(ACTOR_TYPES).optional(),
  motivation: z.enum(ACTOR_MOTIVATIONS).optional(),
});
export type SearchActorsInput = z.infer<typeof SearchActorsSchema>;

/** Schema for actor export. */
export const ExportActorsSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  actorType: z.enum(ACTOR_TYPES).optional(),
  motivation: z.enum(ACTOR_MOTIVATIONS).optional(),
  active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type ExportActorsInput = z.infer<typeof ExportActorsSchema>;

/** Schema for UUID path parameter. */
export const ActorParamsSchema = z.object({
  id: z.string().uuid('Invalid actor ID format'),
});
export type ActorParamsInput = z.infer<typeof ActorParamsSchema>;

/** Schema for linked IOCs query. */
export const LinkedIocsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type LinkedIocsInput = z.infer<typeof LinkedIocsSchema>;

/** Schema for timeline query. */
export const TimelineSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});
export type TimelineInput = z.infer<typeof TimelineSchema>;
