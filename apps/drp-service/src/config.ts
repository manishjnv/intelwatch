import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_DRP_PORT: z.coerce.number().int().min(1).max(65535).default(3011),
  TI_DRP_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1),
  TI_JWT_SECRET: z.string().min(32),
  TI_JWT_REFRESH_SECRET: z.string().min(32).optional(),
  TI_SERVICE_JWT_SECRET: z.string().min(16),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TI_DRP_MAX_TYPOSQUAT_CANDIDATES: z.coerce.number().int().min(10).max(1000).default(200),
  TI_DRP_SCAN_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
  TI_GRAPH_SERVICE_URL: z.string().default('http://localhost:3012'),
  TI_DRP_GRAPH_SYNC_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  TI_DRP_MAX_ASSETS_PER_TENANT: z.coerce.number().int().min(1).default(100),
});

export type DRPConfig = z.infer<typeof ConfigSchema>;

let _config: DRPConfig | null = null;

/** Parse and validate DRP service configuration from environment. */
export function loadConfig(env: Record<string, string | undefined>): DRPConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid DRP config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

/** Get the cached configuration. Throws if not loaded. */
export function getConfig(): DRPConfig {
  if (!_config) throw new AppError(500, 'DRP config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
