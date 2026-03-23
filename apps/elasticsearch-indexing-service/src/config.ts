import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_ES_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3020),
  TI_ES_SERVICE_HOST: z.string().default('0.0.0.0'),
  TI_ES_URL: z.string().min(1).default('http://localhost:9200'),
  TI_ES_USERNAME: z.string().default('elastic'),
  TI_ES_PASSWORD: z.string().default('changeme'),
  TI_REDIS_URL: z.string().min(1).default('redis://localhost:6379/0'),
  TI_JWT_SECRET: z.string().min(32).default('dev-jwt-secret-min-32-chars-long!!'),
  TI_SERVICE_JWT_SECRET: z.string().min(16).default('dev-service-secret!!'),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(500),
  TI_LOG_LEVEL: z.string().default('info'),
});

export type EsIndexingConfig = z.infer<typeof ConfigSchema>;

let _config: EsIndexingConfig | null = null;

/** Load and validate environment configuration. Throws AppError on invalid config. */
export function loadConfig(env: Record<string, string | undefined>): EsIndexingConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

/** Get the previously loaded config. Throws if not yet loaded. */
export function getConfig(): EsIndexingConfig {
  if (!_config) throw new AppError(500, 'Config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
