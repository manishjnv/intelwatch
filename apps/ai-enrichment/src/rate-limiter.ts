import type pino from 'pino';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Sliding window rate limiter for external API providers.
 * Tracks timestamps of recent requests and enforces limits.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly name: string;
  private readonly config: RateLimitConfig;
  private readonly logger: pino.Logger;

  constructor(name: string, config: RateLimitConfig, logger: pino.Logger) {
    this.name = name;
    this.config = config;
    this.logger = logger;
  }

  /** Check if a request is allowed under the rate limit */
  canRequest(): boolean {
    this.pruneOld();
    return this.timestamps.length < this.config.maxRequests;
  }

  /** Record a request timestamp */
  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  /** Wait until a request slot is available (returns ms to wait, 0 if ready) */
  msUntilReady(): number {
    this.pruneOld();
    if (this.timestamps.length < this.config.maxRequests) return 0;
    const oldest = this.timestamps[0]!;
    return Math.max(0, oldest + this.config.windowMs - Date.now());
  }

  /** Execute a request with rate limiting — waits if needed */
  async acquire(): Promise<void> {
    const wait = this.msUntilReady();
    if (wait > 0) {
      this.logger.debug({ provider: this.name, waitMs: wait }, 'Rate limit — waiting');
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.recordRequest();
  }

  /** Get current usage stats */
  stats(): { used: number; max: number; windowMs: number } {
    this.pruneOld();
    return { used: this.timestamps.length, max: this.config.maxRequests, windowMs: this.config.windowMs };
  }

  private pruneOld(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }
}

/** Create VT rate limiter (default: 4 req/min for free tier) */
export function createVTRateLimiter(maxPerMin: number, logger: pino.Logger): RateLimiter {
  return new RateLimiter('virustotal', { maxRequests: maxPerMin, windowMs: 60_000 }, logger);
}

/** Create AbuseIPDB rate limiter (default: 1000 req/day) */
export function createAbuseIPDBRateLimiter(maxPerDay: number, logger: pino.Logger): RateLimiter {
  return new RateLimiter('abuseipdb', { maxRequests: maxPerDay, windowMs: 86_400_000 }, logger);
}

/** Create Google Safe Browsing rate limiter (default: 8000 req/day) */
export function createGSBRateLimiter(maxPerDay: number, logger: pino.Logger): RateLimiter {
  return new RateLimiter('google-safe-browsing', { maxRequests: maxPerDay, windowMs: 86_400_000 }, logger);
}
