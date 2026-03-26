import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_DATABASE_URL: z.string().min(1).default('postgresql://localhost:5432/etip'),
  TI_BILLING_PORT: z.coerce.number().int().min(1).max(65535).default(3019),
  TI_BILLING_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1).default('redis://localhost:6379/0'),
  TI_JWT_SECRET: z.string().min(32).default('dev-jwt-secret-min-32-chars-long!!'),
  TI_SERVICE_JWT_SECRET: z.string().min(16).default('dev-service-secret!!'),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_LOG_LEVEL: z.string().default('info'),
  TI_RAZORPAY_KEY_ID: z.string().min(1).default('rzp_test_placeholder'),
  TI_RAZORPAY_KEY_SECRET: z.string().min(16).default('placeholder_secret_32_chars_padded'),
  TI_RAZORPAY_WEBHOOK_SECRET: z.string().min(16).default('placeholder_webhook_32_chars_pad!'),
});

export type BillingConfig = z.infer<typeof ConfigSchema>;

let _config: BillingConfig | null = null;

/** Load and validate environment configuration. Throws AppError on missing required vars. */
export function loadConfig(env: Record<string, string | undefined>): BillingConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError(500, `Invalid config: ${details.join('; ')}`, 'CONFIG_INVALID');
  }
  _config = result.data;
  return _config;
}

/** Get the loaded config. Throws if not yet loaded. */
export function getConfig(): BillingConfig {
  if (!_config) throw new AppError(500, 'Config not loaded', 'CONFIG_NOT_LOADED');
  return _config;
}
