import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const ConfigSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_USER_MANAGEMENT_PORT: z.coerce.number().int().min(1).max(65535).default(3016),
  TI_USER_MANAGEMENT_HOST: z.string().default('0.0.0.0'),
  TI_REDIS_URL: z.string().min(1),
  TI_JWT_SECRET: z.string().min(32),
  TI_JWT_REFRESH_SECRET: z.string().min(32).optional(),
  TI_SERVICE_JWT_SECRET: z.string().min(16),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  TI_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // MFA
  TI_MFA_ISSUER: z.string().default('ETIP Platform'),
  TI_MFA_BACKUP_CODE_COUNT: z.coerce.number().int().min(5).max(20).default(10),

  // Break-glass
  TI_BREAK_GLASS_SESSION_TTL_MIN: z.coerce.number().int().min(5).max(120).default(30),

  // SSO
  TI_SSO_CALLBACK_BASE_URL: z.string().default('http://localhost:3016'),
});

export type UserManagementConfig = z.infer<typeof ConfigSchema>;

let _config: UserManagementConfig | null = null;

/** Validate environment and cache config. */
export function loadConfig(env: Record<string, string | undefined>): UserManagementConfig {
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
export function getConfig(): UserManagementConfig {
  if (!_config) {
    throw new AppError(500, 'Config not loaded — call loadConfig() first', 'CONFIG_NOT_LOADED');
  }
  return _config;
}
