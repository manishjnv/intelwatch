import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const EnvSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_NORMALIZATION_PORT: z.coerce.number().int().min(1).max(65535).default(3005),
  TI_NORMALIZATION_HOST: z.string().default('0.0.0.0'),
  TI_DATABASE_URL: z.string().min(1),
  TI_REDIS_URL: z.string().min(1),
  TI_JWT_SECRET: z.string().min(32),
  TI_JWT_ISSUER: z.string().default('intelwatch-etip'),
  TI_JWT_ACCESS_EXPIRY: z.coerce.number().int().default(900),
  TI_JWT_REFRESH_EXPIRY: z.coerce.number().int().default(604800),
  TI_SERVICE_JWT_SECRET: z.string().min(16),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60000),
  TI_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(100),
  TI_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** Max IOCs to process per normalization job */
  TI_NORMALIZATION_BATCH_SIZE: z.coerce.number().int().min(1).default(500),
  /** Worker concurrency for BullMQ normalize queue */
  TI_NORMALIZATION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
});

export type AppConfig = z.infer<typeof EnvSchema>;
let _config: AppConfig | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new AppError(500, `Invalid environment configuration:\n${issues}`, 'CONFIG_ERROR');
  }
  _config = result.data;
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) throw new AppError(500, 'Config not loaded — call loadConfig() first', 'CONFIG_ERROR');
  return _config;
}
