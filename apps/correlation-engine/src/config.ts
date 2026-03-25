import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const EnvSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_CORRELATION_PORT: z.coerce.number().int().min(1).max(65535).default(3013),
  TI_CORRELATION_HOST: z.string().default('0.0.0.0'),
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

  // Correlation-specific tunables
  TI_CORRELATION_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  TI_CORRELATION_ZSCORE_THRESHOLD: z.coerce.number().min(1.0).max(5.0).default(2.0),
  TI_CORRELATION_DBSCAN_EPSILON: z.coerce.number().min(0.05).max(1.0).default(0.3),
  TI_CORRELATION_DBSCAN_MIN_PTS: z.coerce.number().int().min(2).max(20).default(3),
  TI_CORRELATION_FP_THRESHOLD: z.coerce.number().min(0.1).max(1.0).default(0.7),
  TI_CORRELATION_FP_MIN_SAMPLES: z.coerce.number().int().min(1).max(100).default(5),
  TI_CORRELATION_INFERENCE_DECAY: z.coerce.number().min(0.1).max(1.0).default(0.8),
  TI_CORRELATION_INFERENCE_MAX_DEPTH: z.coerce.number().int().min(1).max(5).default(3),
  TI_CORRELATION_INFERENCE_MIN_CONF: z.coerce.number().min(0.01).max(0.5).default(0.1),
  TI_CORRELATION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  TI_CORRELATION_MAX_RESULTS: z.coerce.number().int().min(100).max(100000).default(10000),
  TI_CORRELATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0.1).max(1.0).default(0.6),

  // AI Pattern Detection (#11)
  TI_ANTHROPIC_API_KEY: z.string().default(''),
  TI_CORRELATION_AI_ENABLED: z.enum(['true', 'false']).default('false'),
  TI_CORRELATION_AI_MODEL: z.string().default('claude-sonnet-4-20250514'),
  TI_CORRELATION_AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(5.0),
  TI_CORRELATION_AI_MAX_TOKENS: z.coerce.number().int().min(100).max(4096).default(1024),

  // Confidence Decay (#13)
  TI_CORRELATION_DECAY_CHECK_HOURS: z.coerce.number().int().min(1).max(168).default(6),

  // Graph Integration (#15)
  TI_GRAPH_SERVICE_URL: z.string().default('http://threat-graph:3012'),
  TI_GRAPH_SYNC_ENABLED: z.enum(['true', 'false']).default('false'),

  // Downstream pipeline flags
  TI_ALERT_ENABLED: z.coerce.boolean().default(true),
  TI_INTEGRATION_PUSH_ENABLED: z.coerce.boolean().default(true),

  // Redis pattern persistence (P1-1)
  TI_CORRELATION_CHECKPOINT_ENABLED: z.enum(['true', 'false']).default('true'),
  TI_CORRELATION_CHECKPOINT_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
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
