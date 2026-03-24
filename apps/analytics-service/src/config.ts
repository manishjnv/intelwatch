/**
 * @module config
 * @description Validated configuration for analytics-service.
 */
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3024),
  TI_SERVICE_HOST: z.string().default('0.0.0.0'),
  TI_JWT_SECRET: z.string().min(32).default('dev-jwt-secret-min-32-chars-long!!'),
  TI_SERVICE_JWT_SECRET: z.string().min(16).default('dev-service-secret!!'),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_LOG_LEVEL: z.string().default('info'),
  TI_API_GATEWAY_URL: z.string().default('http://etip_api:3001'),
  TI_CACHE_DASHBOARD_TTL_S: z.coerce.number().int().min(60).default(172800),
  TI_CACHE_TREND_TTL_S: z.coerce.number().int().min(60).default(3600),
});

export type AnalyticsConfig = z.infer<typeof ConfigSchema>;

let _config: AnalyticsConfig | null = null;

/** Parse and validate environment variables. */
export function loadConfig(env: Record<string, string | undefined>): AnalyticsConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

/** Get previously loaded config. */
export function getConfig(): AnalyticsConfig {
  if (!_config) throw new AppError(500, 'Config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
