/**
 * @module api-gateway/quota/usage-counter
 * @description Redis-backed usage counters with Lua atomic check-and-increment.
 * Key format: quota:{tenantId}:{featureKey}:{period}:{periodValue}
 * TTLs: daily 48hr, weekly 9d, monthly 35d, total no expiry.
 */
import type { FeatureLimits, QuotaCheckResult, UsageSnapshot } from '@etip/shared-types';
import { getRedis } from './plan-cache.js';

// ── Period Helpers ─────────────────────────────────────────────────────

function getDailyKey(tenantId: string, featureKey: string): string {
  const d = new Date();
  const day = d.toISOString().slice(0, 10); // 2026-03-29
  return `quota:${tenantId}:${featureKey}:daily:${day}`;
}

function getWeeklyKey(tenantId: string, featureKey: string): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getUTCDay()) / 7);
  return `quota:${tenantId}:${featureKey}:weekly:${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getMonthlyKey(tenantId: string, featureKey: string): string {
  const d = new Date();
  const month = d.toISOString().slice(0, 7); // 2026-03
  return `quota:${tenantId}:${featureKey}:monthly:${month}`;
}

function getTotalKey(tenantId: string, featureKey: string): string {
  return `quota:${tenantId}:${featureKey}:total:current`;
}

// ── TTLs in seconds ────────────────────────────────────────────────────
const TTL_DAILY = 48 * 3600;      // 48 hours
const TTL_WEEKLY = 9 * 86400;     // 9 days
const TTL_MONTHLY = 35 * 86400;   // 35 days

// ── Lua Script: Atomic check-and-increment ─────────────────────────────
/**
 * KEYS[1..4] = daily, weekly, monthly, total keys
 * ARGV[1..4] = daily, weekly, monthly, total limits (-1 = unlimited/skip)
 * ARGV[5..7] = TTLs for daily, weekly, monthly
 *
 * Returns: JSON string
 *   { "allowed": true, "counters": { "daily": N, "weekly": N, "monthly": N, "total": N } }
 *   { "allowed": false, "exceededPeriod": "daily", "limit": 100, "used": 100 }
 */
const CHECK_AND_INCREMENT_LUA = `
local dailyKey = KEYS[1]
local weeklyKey = KEYS[2]
local monthlyKey = KEYS[3]
local totalKey = KEYS[4]

local limitDaily = tonumber(ARGV[1])
local limitWeekly = tonumber(ARGV[2])
local limitMonthly = tonumber(ARGV[3])
local limitTotal = tonumber(ARGV[4])
local ttlDaily = tonumber(ARGV[5])
local ttlWeekly = tonumber(ARGV[6])
local ttlMonthly = tonumber(ARGV[7])

-- GET all current values
local usedDaily = tonumber(redis.call('GET', dailyKey) or '0') or 0
local usedWeekly = tonumber(redis.call('GET', weeklyKey) or '0') or 0
local usedMonthly = tonumber(redis.call('GET', monthlyKey) or '0') or 0
local usedTotal = tonumber(redis.call('GET', totalKey) or '0') or 0

-- Check limits (-1 means unlimited, skip check)
if limitDaily >= 0 and usedDaily >= limitDaily then
  return cjson.encode({allowed = false, exceededPeriod = 'daily', limit = limitDaily, used = usedDaily})
end
if limitWeekly >= 0 and usedWeekly >= limitWeekly then
  return cjson.encode({allowed = false, exceededPeriod = 'weekly', limit = limitWeekly, used = usedWeekly})
end
if limitMonthly >= 0 and usedMonthly >= limitMonthly then
  return cjson.encode({allowed = false, exceededPeriod = 'monthly', limit = limitMonthly, used = usedMonthly})
end
if limitTotal >= 0 and usedTotal >= limitTotal then
  return cjson.encode({allowed = false, exceededPeriod = 'total', limit = limitTotal, used = usedTotal})
end

-- All checks pass — atomically increment all applicable counters
local newDaily = redis.call('INCR', dailyKey)
if redis.call('TTL', dailyKey) == -1 then
  redis.call('EXPIRE', dailyKey, ttlDaily)
end

local newWeekly = redis.call('INCR', weeklyKey)
if redis.call('TTL', weeklyKey) == -1 then
  redis.call('EXPIRE', weeklyKey, ttlWeekly)
end

local newMonthly = redis.call('INCR', monthlyKey)
if redis.call('TTL', monthlyKey) == -1 then
  redis.call('EXPIRE', monthlyKey, ttlMonthly)
end

local newTotal = redis.call('INCR', totalKey)

return cjson.encode({
  allowed = true,
  counters = {
    daily = newDaily,
    weekly = newWeekly,
    monthly = newMonthly,
    total = newTotal
  }
})
`;

let luaSha: string | null = null;

/**
 * Atomic check-and-increment: verify all 4 period limits, then increment
 * all counters if allowed. Uses EVALSHA with EVAL fallback.
 */
export async function checkAndIncrement(
  tenantId: string,
  featureKey: string,
  limits: FeatureLimits,
): Promise<QuotaCheckResult> {
  const redis = getRedis();
  if (!redis) {
    // No Redis → allow (degrade gracefully, no enforcement)
    return { allowed: true, counters: { daily: 0, weekly: 0, monthly: 0, total: 0 } };
  }

  const keys = [
    getDailyKey(tenantId, featureKey),
    getWeeklyKey(tenantId, featureKey),
    getMonthlyKey(tenantId, featureKey),
    getTotalKey(tenantId, featureKey),
  ];

  const args = [
    String(limits.limitDaily),
    String(limits.limitWeekly),
    String(limits.limitMonthly),
    String(limits.limitTotal),
    String(TTL_DAILY),
    String(TTL_WEEKLY),
    String(TTL_MONTHLY),
  ];

  let raw: string;
  try {
    // Try EVALSHA first (cached script)
    if (luaSha) {
      raw = await redis.evalsha(luaSha, 4, ...keys, ...args) as string;
    } else {
      // First run — load script and cache SHA
      luaSha = await redis.script('LOAD', CHECK_AND_INCREMENT_LUA) as string;
      raw = await redis.evalsha(luaSha, 4, ...keys, ...args) as string;
    }
  } catch {
    // EVALSHA failed (script flushed) — fallback to EVAL
    luaSha = null;
    raw = await redis.eval(CHECK_AND_INCREMENT_LUA, 4, ...keys, ...args) as string;
  }

  return JSON.parse(raw) as QuotaCheckResult;
}

/**
 * Decrement all counters for a feature (rollback on failed requests).
 * Non-atomic — acceptable since it's a best-effort correction.
 */
export async function decrementCounters(
  tenantId: string,
  featureKey: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const pipeline = redis.pipeline();
    pipeline.decr(getDailyKey(tenantId, featureKey));
    pipeline.decr(getWeeklyKey(tenantId, featureKey));
    pipeline.decr(getMonthlyKey(tenantId, featureKey));
    pipeline.decr(getTotalKey(tenantId, featureKey));
    await pipeline.exec();
  } catch {
    /* best-effort */
  }
}

/** Get current usage snapshot for a feature (for usage query endpoints) */
export async function getUsage(
  tenantId: string,
  featureKey: string,
): Promise<UsageSnapshot> {
  const redis = getRedis();
  if (!redis) return { daily: 0, weekly: 0, monthly: 0, total: 0 };

  try {
    const [daily, weekly, monthly, total] = await redis.mget(
      getDailyKey(tenantId, featureKey),
      getWeeklyKey(tenantId, featureKey),
      getMonthlyKey(tenantId, featureKey),
      getTotalKey(tenantId, featureKey),
    );
    return {
      daily: parseInt(daily ?? '0', 10),
      weekly: parseInt(weekly ?? '0', 10),
      monthly: parseInt(monthly ?? '0', 10),
      total: parseInt(total ?? '0', 10),
    };
  } catch {
    return { daily: 0, weekly: 0, monthly: 0, total: 0 };
  }
}

/** Reset usage counters for a specific period (admin reset endpoint) */
export async function resetUsage(
  tenantId: string,
  featureKey: string,
  period: 'daily' | 'weekly' | 'monthly' | 'total' | 'all',
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const pipeline = redis.pipeline();
  if (period === 'daily' || period === 'all') {
    pipeline.del(getDailyKey(tenantId, featureKey));
  }
  if (period === 'weekly' || period === 'all') {
    pipeline.del(getWeeklyKey(tenantId, featureKey));
  }
  if (period === 'monthly' || period === 'all') {
    pipeline.del(getMonthlyKey(tenantId, featureKey));
  }
  if (period === 'total' || period === 'all') {
    pipeline.del(getTotalKey(tenantId, featureKey));
  }
  await pipeline.exec();
}

/**
 * Compute the reset timestamp for a given period (for X-Quota-Reset headers).
 */
export function getResetTimestamp(period: 'daily' | 'weekly' | 'monthly' | 'total'): string {
  const now = new Date();
  switch (period) {
    case 'daily': {
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      return tomorrow.toISOString();
    }
    case 'weekly': {
      const daysToMonday = (8 - now.getUTCDay()) % 7 || 7;
      const nextWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday));
      return nextWeek.toISOString();
    }
    case 'monthly': {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return nextMonth.toISOString();
    }
    case 'total':
      return 'never';
  }
}
