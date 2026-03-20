import { z } from 'zod';

export const FEED_TYPES = [
  'stix', 'taxii', 'misp', 'rss', 'rest_api', 'nvd',
  'csv_upload', 'json_upload', 'webhook', 'email_imap',
] as const;

export const FEED_STATUSES = ['active', 'paused', 'error', 'disabled'] as const;

export const FeedTypeEnum = z.enum(FEED_TYPES);
export const FeedStatusEnum = z.enum(FEED_STATUSES);

const cronRegex = /^[\d\s*/\-,]+$/;

export const CreateFeedSchema = z.object({
  name: z.string().min(1).max(255),
  feedType: FeedTypeEnum,
  url: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  schedule: z.string().regex(cronRegex, 'Invalid cron expression').default('0 * * * *'),
  headers: z.record(z.string()).optional(),
  authConfig: z.record(z.unknown()).optional(),
  parseConfig: z.record(z.unknown()).optional(),
});
export type CreateFeedInput = z.infer<typeof CreateFeedSchema>;

export const UpdateFeedSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  feedType: FeedTypeEnum.optional(),
  url: z.string().url().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  schedule: z.string().regex(cronRegex, 'Invalid cron expression').optional(),
  headers: z.record(z.string()).optional(),
  authConfig: z.record(z.unknown()).optional(),
  parseConfig: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  status: z.enum(['active', 'paused']).optional(),
});
export type UpdateFeedInput = z.infer<typeof UpdateFeedSchema>;

export const FeedIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const ListFeedsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  status: FeedStatusEnum.optional(),
  feedType: FeedTypeEnum.optional(),
  search: z.string().max(100).optional(),
});
export type ListFeedsQuery = z.infer<typeof ListFeedsQuerySchema>;
