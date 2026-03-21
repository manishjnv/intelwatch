import { z } from 'zod';

// ── Enum mirrors of Prisma enums ────────────────────────────────

export const IocTypeEnum = z.enum([
  'ip', 'ipv6', 'domain', 'fqdn', 'url', 'email',
  'hash_md5', 'hash_sha1', 'hash_sha256', 'hash_sha512',
  'cve', 'asn', 'cidr', 'bitcoin_address', 'unknown',
]);

export const SeverityEnum = z.enum(['info', 'low', 'medium', 'high', 'critical']);

export const TlpEnum = z.enum(['white', 'green', 'amber', 'red']);

export const LifecycleEnum = z.enum([
  'new', 'active', 'aging', 'expired', 'archived',
  'false_positive', 'revoked', 'reactivated',
]);

// ── Query schemas ───────────────────────────────────────────────

/** GET /api/v1/ioc query parameters. */
export const ListIocsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  sort: z.enum([
    'firstSeen', 'lastSeen', 'confidence', 'severity', 'createdAt',
  ]).default('lastSeen'),
  order: z.enum(['asc', 'desc']).default('desc'),
  iocType: z.union([IocTypeEnum, z.array(IocTypeEnum)]).optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : undefined)),
  severity: z.union([SeverityEnum, z.array(SeverityEnum)]).optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : undefined)),
  lifecycle: z.union([LifecycleEnum, z.array(LifecycleEnum)]).optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : undefined)),
  tlp: z.union([TlpEnum, z.array(TlpEnum)]).optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : undefined)),
  tags: z.union([z.string(), z.array(z.string())]).optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : undefined)),
  search: z.string().max(500).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  feedSourceId: z.string().uuid().optional(),
});
export type ListIocsQuery = z.infer<typeof ListIocsQuerySchema>;

// ── Mutation schemas ────────────────────────────────────────────

/** POST /api/v1/ioc — create a manual IOC. */
export const CreateIocBodySchema = z.object({
  iocType: IocTypeEnum,
  value: z.string().min(1).max(10000).trim(),
  severity: SeverityEnum.optional().default('medium'),
  tlp: TlpEnum.optional().default('amber'),
  confidence: z.number().int().min(0).max(100).optional().default(70),
  tags: z.array(z.string().max(100)).max(50).optional().default([]),
  threatActors: z.array(z.string().max(200)).max(20).optional().default([]),
  malwareFamilies: z.array(z.string().max(200)).max(20).optional().default([]),
  mitreAttack: z.array(z.string().regex(/^T\d{4}(\.\d{3})?$/)).max(30).optional().default([]),
  expiresAt: z.coerce.date().optional(),
});
export type CreateIocBody = z.infer<typeof CreateIocBodySchema>;

/** B2: Analyst confidence override with reason. */
export const AnalystOverrideSchema = z.object({
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(500),
});

/** PUT /api/v1/ioc/:id — update IOC metadata. */
export const UpdateIocBodySchema = z.object({
  severity: SeverityEnum.optional(),
  tlp: TlpEnum.optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  lifecycle: LifecycleEnum.optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  threatActors: z.array(z.string().max(200)).max(20).optional(),
  malwareFamilies: z.array(z.string().max(200)).max(20).optional(),
  mitreAttack: z.array(z.string().regex(/^T\d{4}(\.\d{3})?$/)).max(30).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  analystOverride: AnalystOverrideSchema.optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});
export type UpdateIocBody = z.infer<typeof UpdateIocBodySchema>;

// ── Bulk schemas ────────────────────────────────────────────────

export const BulkActionEnum = z.enum(['set_severity', 'set_lifecycle', 'add_tags', 'remove_tags', 'set_tags']);

/** POST /api/v1/ioc/bulk — bulk operations on IOCs. */
export const BulkOperationSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(10000),
  action: BulkActionEnum,
  severity: SeverityEnum.optional(),
  lifecycle: LifecycleEnum.optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'set_severity' && !data.severity) {
    ctx.addIssue({ code: 'custom', message: 'severity is required for set_severity action', path: ['severity'] });
  }
  if (data.action === 'set_lifecycle' && !data.lifecycle) {
    ctx.addIssue({ code: 'custom', message: 'lifecycle is required for set_lifecycle action', path: ['lifecycle'] });
  }
  if (['add_tags', 'remove_tags', 'set_tags'].includes(data.action) && (!data.tags || data.tags.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'tags are required for tag actions', path: ['tags'] });
  }
});
export type BulkOperation = z.infer<typeof BulkOperationSchema>;

// ── Search schemas ──────────────────────────────────────────────

/** POST /api/v1/ioc/search — full-text search. */
export const SearchIocsBodySchema = z.object({
  query: z.string().min(1).max(500).trim(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
  iocType: z.array(IocTypeEnum).optional(),
  severity: z.array(SeverityEnum).optional(),
  lifecycle: z.array(LifecycleEnum).optional(),
  tlp: z.array(TlpEnum).optional(),
  minConfidence: z.number().int().min(0).max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type SearchIocsBody = z.infer<typeof SearchIocsBodySchema>;

// ── Export schemas ──────────────────────────────────────────────

export const ExportFormatEnum = z.enum(['csv', 'json']);

export const ExportProfileEnum = z.enum(['high_fidelity', 'monitoring', 'research']);

/** POST /api/v1/ioc/export — filtered export with optional profile (D2). */
export const ExportIocsBodySchema = z.object({
  format: ExportFormatEnum.default('json'),
  profile: ExportProfileEnum.optional(),
  includeProvenance: z.boolean().optional().default(false),
  iocType: z.array(IocTypeEnum).optional(),
  severity: z.array(SeverityEnum).optional(),
  lifecycle: z.array(LifecycleEnum).optional(),
  tlp: z.array(TlpEnum).optional(),
  tags: z.array(z.string()).optional(),
  minConfidence: z.number().int().min(0).max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  maxResults: z.number().int().min(1).max(50000).default(10000),
});
export type ExportIocsBody = z.infer<typeof ExportIocsBodySchema>;

// ── Param schemas ───────────────────────────────────────────────

/** UUID path parameter. */
export const IocIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type IocIdParam = z.infer<typeof IocIdParamSchema>;

// ── Campaign schemas ────────────────────────────────────────────

/** GET /api/v1/ioc/campaigns query parameters. */
export const CampaignQuerySchema = z.object({
  minFeeds: z.coerce.number().int().min(1).max(20).default(2),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CampaignQuery = z.infer<typeof CampaignQuerySchema>;
