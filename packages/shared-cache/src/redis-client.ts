/**
 * @module @etip/shared-cache/redis-client
 * @description Redis client factory with retry logic, connection events,
 * and graceful shutdown. Uses ioredis for cluster support.
 */
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

/** Default Redis connection options with retry strategy */
const DEFAULT_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times: number): number | null {
    if (times > 10) {
      console.error(`[redis] Exceeded max retries (${times}). Giving up.`);
      return null; // Stop retrying
    }
    // Exponential backoff: 200ms, 400ms, 800ms... capped at 5s
    const delay = Math.min(times * 200, 5000);
    console.warn(`[redis] Reconnecting in ${delay}ms (attempt ${times})...`);
    return delay;
  },
  reconnectOnError(err: Error): boolean {
    const targetErrors = ['READONLY', 'ECONNREFUSED', 'ECONNRESET'];
    return targetErrors.some((e) => err.message.includes(e));
  },
  lazyConnect: false,
};

/**
 * Create a configured Redis client instance.
 *
 * @param url - Redis connection URL (default: env REDIS_URL or localhost)
 * @param options - Additional ioredis options to merge
 * @returns Configured Redis instance with retry logic
 *
 * @example
 * ```typescript
 * const redis = createRedisClient(process.env.REDIS_URL);
 * await redis.ping(); // 'PONG'
 * ```
 */
export function createRedisClient(
  url?: string,
  options?: Partial<RedisOptions>
): Redis {
  const connectionUrl = url || process.env['REDIS_URL'] || 'redis://localhost:6379';
  const client = new Redis(connectionUrl, { ...DEFAULT_OPTIONS, ...options });

  client.on('connect', () => {
    console.info('[redis] Connected successfully');
  });

  client.on('ready', () => {
    console.info('[redis] Ready to accept commands');
  });

  client.on('error', (err: Error) => {
    console.error('[redis] Connection error:', err.message);
  });

  client.on('close', () => {
    console.warn('[redis] Connection closed');
  });

  return client;
}

/**
 * Gracefully disconnect a Redis client.
 * Waits for pending commands to complete before closing.
 *
 * @param client - Redis client to disconnect
 */
export async function disconnectRedis(client: Redis): Promise<void> {
  try {
    await client.quit();
    console.info('[redis] Disconnected gracefully');
  } catch {
    client.disconnect();
    console.warn('[redis] Forced disconnect');
  }
}
