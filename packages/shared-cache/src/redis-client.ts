import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
const DEFAULT_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 3, enableReadyCheck: true,
  retryStrategy(times: number): number | null {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
  },
  lazyConnect: false,
};
export function createRedisClient(url?: string, options?: Partial<RedisOptions>): Redis {
  const connectionUrl = url || process.env['REDIS_URL'] || 'redis://localhost:6379';
  const client = new Redis(connectionUrl, { ...DEFAULT_OPTIONS, ...options });
  client.on('connect', () => { console.info('[redis] Connected'); });
  client.on('error', (err: Error) => { console.error('[redis] Error:', err.message); });
  return client;
}
export async function disconnectRedis(client: Redis): Promise<void> {
  try { await client.quit(); } catch { client.disconnect(); }
}
