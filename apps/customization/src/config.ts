import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_CUSTOMIZATION_PORT: z.coerce.number().int().min(1).max(65535).default(3017),
  TI_CUSTOMIZATION_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1).default('redis://localhost:6379/0'),
  TI_JWT_SECRET: z.string().min(32).default('dev-jwt-secret-min-32-chars-long!!'),
  TI_SERVICE_JWT_SECRET: z.string().min(16).default('dev-service-secret!!'),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_LOG_LEVEL: z.string().default('info'),
});

export type CustomizationConfig = z.infer<typeof ConfigSchema>;

let _config: CustomizationConfig | null = null;

export function loadConfig(env: Record<string, string | undefined>): CustomizationConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

export function getConfig(): CustomizationConfig {
  if (!_config) throw new AppError(500, 'Config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
