import { AppError } from '@etip/shared-utils';
import type { FeedPolicy, FeedCategory, SetFeedPolicyInput } from '../schemas/feed-policy.js';

/**
 * In-memory store for per-feed processing policies.
 *
 * Per DECISION-013: in-memory state for Phase validation.
 * State resets on service restart; migrate to DB-backed when scaling.
 *
 * Key: `{tenantId}:{feedId}`
 */
export class FeedPolicyStore {
  private readonly policies = new Map<string, FeedPolicy>();

  private key(tenantId: string, feedId: string): string {
    return `${tenantId}:${feedId}`;
  }

  private buildDefaults(tenantId: string, feedId: string, category?: FeedCategory): FeedPolicy {
    return {
      feedId,
      tenantId,
      category:        category ?? 'news_feed',
      dailyLimit:      100,
      aiEnabled:       true,
      currentDayCount: 0,
      lastResetAt:     new Date(),
    };
  }

  /**
   * Get policy for a feed. Returns null if no policy has been set.
   */
  getPolicy(tenantId: string, feedId: string): FeedPolicy | null {
    return this.policies.get(this.key(tenantId, feedId)) ?? null;
  }

  /**
   * Get policy, auto-initialising with defaults if one does not exist.
   * Useful in routes where the policy should always exist after the first GET.
   */
  getOrInit(tenantId: string, feedId: string, category?: FeedCategory): FeedPolicy {
    const existing = this.policies.get(this.key(tenantId, feedId));
    if (existing) return existing;
    const policy = this.buildDefaults(tenantId, feedId, category);
    this.policies.set(this.key(tenantId, feedId), policy);
    return policy;
  }

  /**
   * Create or fully replace a policy. Preserves currentDayCount and lastResetAt.
   */
  setPolicy(tenantId: string, feedId: string, input: SetFeedPolicyInput): FeedPolicy {
    const existing = this.policies.get(this.key(tenantId, feedId)) ??
      this.buildDefaults(tenantId, feedId);
    const updated: FeedPolicy = {
      ...existing,
      ...(input.category   !== undefined ? { category:   input.category   } : {}),
      ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit } : {}),
      ...(input.aiEnabled  !== undefined ? { aiEnabled:  input.aiEnabled  } : {}),
    };
    this.policies.set(this.key(tenantId, feedId), updated);
    return updated;
  }

  /**
   * Return true if this feed has exhausted its daily article quota.
   * Always false when dailyLimit is 0 (unlimited).
   */
  isCapReached(tenantId: string, feedId: string): boolean {
    const policy = this.policies.get(this.key(tenantId, feedId));
    if (!policy)              return false;  // no policy = no cap
    if (policy.dailyLimit === 0) return false;  // 0 = unlimited
    return policy.currentDayCount >= policy.dailyLimit;
  }

  /**
   * Increment the daily processed-article counter by n.
   * No-op if no policy exists (feed never configured).
   */
  incrementCount(tenantId: string, feedId: string, n: number): void {
    const policy = this.policies.get(this.key(tenantId, feedId));
    if (!policy || n <= 0) return;
    policy.currentDayCount += n;
  }

  /**
   * Manually reset the daily counter for one feed.
   * Throws 404 if the feed has no policy.
   */
  resetCount(tenantId: string, feedId: string): FeedPolicy {
    const policy = this.policies.get(this.key(tenantId, feedId));
    if (!policy) {
      throw new AppError(404, `No policy found for feed ${feedId}`, 'NOT_FOUND');
    }
    policy.currentDayCount = 0;
    policy.lastResetAt     = new Date();
    return policy;
  }

  /**
   * Reset ALL counters — called at midnight by the daily cron in index.ts.
   * Returns number of policies reset.
   */
  resetAll(): number {
    let count = 0;
    for (const policy of this.policies.values()) {
      policy.currentDayCount = 0;
      policy.lastResetAt     = new Date();
      count++;
    }
    return count;
  }

  /**
   * List all policies for a tenant.
   */
  listPolicies(tenantId: string): FeedPolicy[] {
    const result: FeedPolicy[] = [];
    for (const [key, policy] of this.policies) {
      if (key.startsWith(`${tenantId}:`)) result.push(policy);
    }
    return result;
  }

  /**
   * Remove the policy for a feed (e.g. when a feed is deleted).
   * Returns true if a policy was found and removed.
   */
  deletePolicy(tenantId: string, feedId: string): boolean {
    return this.policies.delete(this.key(tenantId, feedId));
  }
}
