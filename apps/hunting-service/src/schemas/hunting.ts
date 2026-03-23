import { z } from 'zod';

// ─── Hunt Session ─────────────────────────────────────────────────

export const HUNT_STATUSES = [
  'draft', 'active', 'paused', 'completed', 'archived',
] as const;

export const HuntStatusSchema = z.enum(HUNT_STATUSES);
export type HuntStatus = z.infer<typeof HuntStatusSchema>;

export const HUNT_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const HuntSeveritySchema = z.enum(HUNT_SEVERITIES);
export type HuntSeverity = z.infer<typeof HuntSeveritySchema>;

export interface HuntSession {
  id: string;
  tenantId: string;
  title: string;
  hypothesis: string;
  status: HuntStatus;
  severity: HuntSeverity;
  assignedTo: string;
  createdBy: string;
  entities: HuntEntity[];
  timeline: TimelineEvent[];
  findings: string;
  tags: string[];
  queryHistory: SavedQuery[];
  correlationLeads: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ─── Hunt Entities ────────────────────────────────────────────────

export const ENTITY_TYPES = [
  'ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256',
  'email', 'cve', 'threat_actor', 'malware', 'campaign',
] as const;

export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export interface HuntEntity {
  id: string;
  type: EntityType;
  value: string;
  addedAt: string;
  addedBy: string;
  notes?: string;
  pivotDepth: number;
  sourceEntityId?: string;
}

// ─── Timeline Events ──────────────────────────────────────────────

export const TIMELINE_EVENT_TYPES = [
  'entity_added', 'entity_removed', 'query_executed', 'pivot_performed',
  'finding_added', 'status_changed', 'correlation_linked', 'note_added',
] as const;

export const TimelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES);

export interface TimelineEvent {
  id: string;
  type: (typeof TIMELINE_EVENT_TYPES)[number];
  description: string;
  userId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Query Builder ────────────────────────────────────────────────

export const QUERY_OPERATORS = ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'range'] as const;
export const QueryOperatorSchema = z.enum(QUERY_OPERATORS);

export const QueryFieldSchema = z.object({
  field: z.string().min(1),
  operator: QueryOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
  valueTo: z.union([z.string(), z.number()]).optional(),
});

export type QueryField = z.infer<typeof QueryFieldSchema>;

export const HuntQuerySchema = z.object({
  entityTypes: z.array(EntityTypeSchema).optional(),
  fields: z.array(QueryFieldSchema).min(1),
  timeRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    lastDays: z.coerce.number().int().min(1).max(365).optional(),
  }).optional(),
  severities: z.array(HuntSeveritySchema).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.string().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type HuntQuery = z.infer<typeof HuntQuerySchema>;

export interface SavedQuery {
  id: string;
  query: HuntQuery;
  name: string;
  resultCount: number;
  executedAt: string;
}

// ─── Elasticsearch DSL Output ─────────────────────────────────────

export interface EsDslQuery {
  query: {
    bool: {
      must: unknown[];
      filter: unknown[];
      should: unknown[];
      must_not: unknown[];
    };
  };
  size: number;
  from: number;
  sort: Array<Record<string, { order: string }>>;
  _source?: string[];
}

// ─── Pivot Chains ─────────────────────────────────────────────────

export interface PivotRequest {
  entityType: EntityType;
  entityValue: string;
  maxHops: number;
  maxResults: number;
  filterTypes?: EntityType[];
}

export interface PivotNode {
  id: string;
  type: EntityType;
  value: string;
  riskScore: number;
  depth: number;
  parentId?: string;
  relationships: PivotRelationship[];
}

export interface PivotRelationship {
  type: string;
  targetId: string;
  targetType: EntityType;
  targetValue: string;
  weight: number;
}

export interface PivotChainResult {
  rootEntity: { type: EntityType; value: string };
  nodes: PivotNode[];
  totalRelationships: number;
  maxDepthReached: number;
  truncated: boolean;
}

// ─── Saved Hunt Templates ─────────────────────────────────────────

export const TEMPLATE_CATEGORIES = [
  'phishing', 'ransomware', 'apt', 'insider_threat', 'supply_chain',
  'credential_theft', 'lateral_movement', 'c2', 'data_exfil', 'custom',
] as const;

export const TemplateCategorySchema = z.enum(TEMPLATE_CATEGORIES);
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;

export interface HuntTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  category: TemplateCategory;
  hypothesis: string;
  defaultQuery: HuntQuery;
  suggestedEntityTypes: EntityType[];
  mitreTechniques: string[];
  tags: string[];
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Correlation Lead ─────────────────────────────────────────────

export interface CorrelationLead {
  correlationId: string;
  type: string;
  confidence: number;
  entities: Array<{ type: EntityType; value: string }>;
  description: string;
  linkedAt: string;
}

// ─── API Request/Response Schemas ─────────────────────────────────

export const CreateHuntSchema = z.object({
  title: z.string().min(1).max(200),
  hypothesis: z.string().min(1).max(2000),
  severity: HuntSeveritySchema.default('medium'),
  tags: z.array(z.string().max(50)).max(20).default([]),
  templateId: z.string().uuid().optional(),
});

export const UpdateHuntSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  hypothesis: z.string().min(1).max(2000).optional(),
  severity: HuntSeveritySchema.optional(),
  findings: z.string().max(50000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const AddEntitySchema = z.object({
  type: EntityTypeSchema,
  value: z.string().min(1).max(2048),
  notes: z.string().max(1000).optional(),
});

export const ChangeStatusSchema = z.object({
  status: HuntStatusSchema,
});

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: TemplateCategorySchema,
  hypothesis: z.string().min(1).max(2000),
  defaultQuery: HuntQuerySchema,
  suggestedEntityTypes: z.array(EntityTypeSchema).default([]),
  mitreTechniques: z.array(z.string().max(20)).max(50).default([]),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const PivotRequestSchema = z.object({
  entityType: EntityTypeSchema,
  entityValue: z.string().min(1),
  maxHops: z.coerce.number().int().min(1).max(6).default(3),
  maxResults: z.coerce.number().int().min(1).max(500).default(100),
  filterTypes: z.array(EntityTypeSchema).optional(),
});

export const ExecuteQuerySchema = z.object({
  query: HuntQuerySchema,
  name: z.string().min(1).max(200).optional(),
});
