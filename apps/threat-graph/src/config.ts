import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const EnvSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_THREAT_GRAPH_PORT: z.coerce.number().int().min(1).max(65535).default(3012),
  TI_THREAT_GRAPH_HOST: z.string().default('0.0.0.0'),
  TI_DATABASE_URL: z.string().min(1),
  TI_REDIS_URL: z.string().min(1),
  TI_NEO4J_URL: z.string().min(1),
  TI_JWT_SECRET: z.string().min(32),
  TI_JWT_ISSUER: z.string().default('intelwatch-etip'),
  TI_JWT_ACCESS_EXPIRY: z.coerce.number().int().default(900),
  TI_JWT_REFRESH_EXPIRY: z.coerce.number().int().default(604800),
  TI_SERVICE_JWT_SECRET: z.string().min(16),
  TI_CORS_ORIGINS: z.string().default('http://localhost:3002'),
  TI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60000),
  TI_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(100),
  TI_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  TI_GRAPH_PROPAGATION_MAX_DEPTH: z.coerce.number().int().min(1).max(5).default(3),
  TI_GRAPH_PROPAGATION_DECAY: z.coerce.number().min(0.1).max(1.0).default(0.7),
  TI_GRAPH_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  TI_GRAPH_DECAY_CRON_INTERVAL: z.coerce.number().int().min(60000).default(21600000), // default 6h
  TI_GRAPH_DECAY_THRESHOLD: z.coerce.number().min(0.1).max(10).default(1.0), // min score drop to trigger update
  TI_GRAPH_MAX_LAYOUT_PRESETS: z.coerce.number().int().min(1).max(100).default(50), // per tenant
});

export type AppConfig = z.infer<typeof EnvSchema>;

let _config: AppConfig | null = null;

/** Validates and loads environment variables into a typed config object. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new AppError(500, `Invalid environment configuration:\n${issues}`, 'CONFIG_ERROR');
  }
  _config = result.data;
  return _config;
}

/** Returns the loaded config. Throws if not initialized. */
export function getConfig(): AppConfig {
  if (!_config) throw new AppError(500, 'Config not loaded — call loadConfig() first', 'CONFIG_ERROR');
  return _config;
}
