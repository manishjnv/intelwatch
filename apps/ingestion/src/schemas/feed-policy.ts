import { z } from 'zod';

export const FeedCategorySchema = z.enum(['ioc_feed', 'news_feed', 'vuln_feed']);
export type FeedCategory = z.infer<typeof FeedCategorySchema>;

/**
 * Feed processing policy — controls per-feed daily throughput and AI usage.
 * Stored in-memory (FeedPolicyStore). Resets daily via midnight cron.
 */
export const FeedPolicySchema = z.object({
  feedId:          z.string().uuid(),
  tenantId:        z.string().uuid(),
  /** Feed category determines default limits and processing strategy */
  category:        FeedCategorySchema.default('news_feed'),
  /** Max articles to process per day (0 = unlimited) */
  dailyLimit:      z.number().int().min(0).default(100),
  /** Enable/disable AI processing for this feed (triage + extraction) */
  aiEnabled:       z.boolean().default(true),
  /** Running count of articles processed today (resets at midnight) */
  currentDayCount: z.number().int().min(0).default(0),
  /** Timestamp of last daily reset */
  lastResetAt:     z.coerce.date(),
});

export type FeedPolicy = z.infer<typeof FeedPolicySchema>;

/** Input for creating/replacing a feed policy */
export const SetFeedPolicySchema = z.object({
  category:   FeedCategorySchema.optional(),
  dailyLimit: z.number().int().min(0).optional(),
  aiEnabled:  z.boolean().optional(),
});
export type SetFeedPolicyInput = z.infer<typeof SetFeedPolicySchema>;
