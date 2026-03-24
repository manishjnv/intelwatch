import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3023),
  TI_SERVICE_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1).default('redis://localhost:6379/0'),
  TI_JWT_SECRET: z.string().min(32).default('dev-jwt-secret-min-32-chars-long!!'),
  TI_SERVICE_JWT_SECRET: z.string().min(16).default('dev-service-secret!!'),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_LOG_LEVEL: z.string().default('info'),
  TI_ALERT_MAX_PER_TENANT: z.coerce.number().int().min(10).default(5000),
  TI_ALERT_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
});

export type AlertingConfig = z.infer<typeof ConfigSchema>;

let _config: AlertingConfig | null = null;

export function loadConfig(env: Record<string, string | undefined>): AlertingConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

export function getConfig(): AlertingConfig {
  if (!_config) throw new AppError(500, 'Config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
