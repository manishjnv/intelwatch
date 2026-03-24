/**
 * @module config
 * @description Validated configuration for caching-service.
 */
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3025),
  TI_SERVICE_HOST: z.string().default('0.0.0.0'),
  TI_JWT_SECRET: z.string().min(32).default('dev-jwt-secret-min-32-chars-long!!'),
  TI_SERVICE_JWT_SECRET: z.string().min(16).default('dev-service-secret!!'),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_LOG_LEVEL: z.string().default('info'),

  // Redis
  TI_REDIS_URL: z.string().default('redis://localhost:6379/0'),

  // MinIO
  TI_MINIO_ENDPOINT: z.string().default('localhost'),
  TI_MINIO_PORT: z.coerce.number().int().default(9000),
  TI_MINIO_ACCESS_KEY: z.string().default('etip_minio_admin'),
  TI_MINIO_SECRET_KEY: z.string().default('etip_minio_secret'),
  TI_MINIO_USE_SSL: z.coerce.boolean().default(false),
  TI_MINIO_BUCKET: z.string().default('etip-archive'),

  // Archive
  TI_ARCHIVE_CRON: z.string().default('0 2 * * *'),
  TI_ARCHIVE_AGE_DAYS: z.coerce.number().int().min(1).default(60),
  TI_ARCHIVE_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),
  TI_ARCHIVE_BATCH_SIZE: z.coerce.number().int().min(100).default(10000),

  // Cache warming
  TI_CACHE_WARM_CRON: z.string().default('*/30 * * * *'),
  TI_ANALYTICS_URL: z.string().default('http://etip_analytics:3024'),
});

export type CachingConfig = z.infer<typeof ConfigSchema>;

let _config: CachingConfig | null = null;

/** Parse and validate environment variables. */
export function loadConfig(env: Record<string, string | undefined>): CachingConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

/** Get previously loaded config. */
export function getConfig(): CachingConfig {
  if (!_config) throw new AppError(500, 'Config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
