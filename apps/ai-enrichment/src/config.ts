import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const EnvSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_ENRICHMENT_PORT: z.coerce.number().int().min(1).max(65535).default(3006),
  TI_ENRICHMENT_HOST: z.string().default('0.0.0.0'),
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
  /** Master switch — external API enrichment only runs when true */
  TI_AI_ENABLED: z.coerce.boolean().default(false),
  /** VirusTotal API key (free tier: 4 req/min) */
  TI_VIRUSTOTAL_API_KEY: z.string().default(''),
  /** AbuseIPDB API key (free tier: 1000 req/day) */
  TI_ABUSEIPDB_API_KEY: z.string().default(''),
  /** Google Safe Browsing API key (free: 10k/day, budget: 8k/day) */
  TI_GSB_API_KEY: z.string().default(''),
  /** GSB rate limit: requests per day */
  TI_GSB_RATE_LIMIT_PER_DAY: z.coerce.number().int().default(8000),
  /** Worker concurrency for BullMQ enrich queue */
  TI_ENRICHMENT_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(2),
  /** VT rate limit: requests per minute */
  TI_VT_RATE_LIMIT_PER_MIN: z.coerce.number().int().default(4),
  /** AbuseIPDB rate limit: requests per day */
  TI_ABUSEIPDB_RATE_LIMIT_PER_DAY: z.coerce.number().int().default(1000),
  /** Anthropic API key for Haiku triage (empty = Haiku disabled) */
  TI_ANTHROPIC_API_KEY: z.string().default(''),
  /** Haiku model ID for IOC triage */
  TI_HAIKU_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  /** Daily cost budget per tenant in USD (0 = unlimited) */
  TI_ENRICHMENT_DAILY_BUDGET_USD: z.coerce.number().min(0).default(5.00),
  /** Enable Redis enrichment cache (disabled = skip cache layer) */
  TI_ENRICHMENT_CACHE_ENABLED: z.coerce.boolean().default(true),
  /** Enable batch enrichment via Anthropic Batch API (#13) */
  TI_BATCH_ENABLED: z.coerce.boolean().default(false),
  /** Minimum IOC count for batch enrichment */
  TI_BATCH_MIN_SIZE: z.coerce.number().int().min(2).default(10),
  /** Re-enrichment scan interval in milliseconds (#15, default 1 hour) */
  TI_REENRICH_INTERVAL_MS: z.coerce.number().int().min(60000).default(3_600_000),
  /** Enable cost persistence to Redis (#14) */
  TI_COST_PERSISTENCE_ENABLED: z.coerce.boolean().default(true),
  /** Downstream pipeline flags — enable/disable enqueuing after enrichment */
  TI_GRAPH_SYNC_ENABLED: z.coerce.boolean().default(true),
  TI_IOC_INDEX_ENABLED: z.coerce.boolean().default(true),
  TI_CORRELATE_ENABLED: z.coerce.boolean().default(true),
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
