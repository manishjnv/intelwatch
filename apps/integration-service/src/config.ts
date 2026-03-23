import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_INTEGRATION_PORT: z.coerce.number().int().min(1).max(65535).default(3015),
  TI_INTEGRATION_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1),
  TI_JWT_SECRET: z.string().min(32),
  TI_JWT_REFRESH_SECRET: z.string().min(32).optional(),
  TI_SERVICE_JWT_SECRET: z.string().min(16),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // SIEM integration
  TI_INTEGRATION_SIEM_RETRY_MAX: z.coerce.number().int().min(1).max(10).default(3),
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: z.coerce.number().int().min(500).default(2000),

  // Webhook
  TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  TI_INTEGRATION_WEBHOOK_MAX_PER_TENANT: z.coerce.number().int().min(1).max(50).default(10),

  // STIX/TAXII
  TI_INTEGRATION_TAXII_PAGE_SIZE: z.coerce.number().int().min(10).max(500).default(100),

  // Credential encryption
  TI_INTEGRATION_ENCRYPTION_KEY: z.string().min(32).default('etip-dev-encryption-key-change-me!'),

  // Rate limiter
  TI_INTEGRATION_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(1000).default(60),

  // Service URLs for pulling data
  TI_IOC_SERVICE_URL: z.string().default('http://localhost:3007'),
  TI_GRAPH_SERVICE_URL: z.string().default('http://localhost:3012'),
  TI_CORRELATION_SERVICE_URL: z.string().default('http://localhost:3013'),
});

export type IntegrationConfig = z.infer<typeof ConfigSchema>;

let _config: IntegrationConfig | null = null;

/** Validate environment and cache config. */
export function loadConfig(env: Record<string, string | undefined>): IntegrationConfig {
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
export function getConfig(): IntegrationConfig {
  if (!_config) {
    throw new AppError(500, 'Config not loaded — call loadConfig() first', 'CONFIG_NOT_LOADED');
  }
  return _config;
}
