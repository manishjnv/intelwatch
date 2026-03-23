import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_HUNTING_PORT: z.coerce.number().int().min(1).max(65535).default(3014),
  TI_HUNTING_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1),
  TI_JWT_SECRET: z.string().min(32),
  TI_JWT_REFRESH_SECRET: z.string().min(32).optional(),
  TI_SERVICE_JWT_SECRET: z.string().min(16),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Hunt query builder
  TI_HUNT_DEFAULT_TIME_RANGE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TI_HUNT_MAX_RESULTS: z.coerce.number().int().min(10).max(10000).default(1000),

  // Hunt session
  TI_HUNT_SESSION_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  TI_HUNT_MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(100).default(20),

  // Pivot chains
  TI_GRAPH_SERVICE_URL: z.string().default('http://localhost:3012'),
  TI_HUNT_MAX_PIVOT_HOPS: z.coerce.number().int().min(1).max(6).default(3),
  TI_HUNT_MAX_PIVOT_RESULTS: z.coerce.number().int().min(10).max(500).default(100),

  // Correlation integration
  TI_CORRELATION_SERVICE_URL: z.string().default('http://localhost:3013'),
  TI_HUNT_CORRELATION_ENABLED: z.coerce.boolean().default(true),
});

export type HuntingConfig = z.infer<typeof ConfigSchema>;

let _config: HuntingConfig | null = null;

/** Validate environment and cache config. */
export function loadConfig(env: Record<string, string | undefined>): HuntingConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    );
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

/** Return cached config. Throws if not loaded. */
export function getConfig(): HuntingConfig {
  if (!_config) {
    throw new AppError(500, 'Config not loaded — call loadConfig() first', 'CONFIG_NOT_LOADED');
  }
  return _config;
}
