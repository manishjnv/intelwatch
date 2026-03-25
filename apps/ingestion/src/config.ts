import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

const EnvSchema = z.object({
  TI_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TI_INGESTION_PORT: z.coerce.number().int().min(1).max(65535).default(3004),
  TI_INGESTION_HOST: z.string().default('0.0.0.0'),
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
  TI_MAX_FEEDS_PER_TENANT: z.coerce.number().int().default(50),
  TI_MAX_CONSECUTIVE_FAILURES: z.coerce.number().int().default(5),

  // ── AI Configuration ────────────────────────────────────────────────
  // API key — set in .env on VPS. If empty, AI stages use rule-based fallback.
  TI_ANTHROPIC_API_KEY: z.string().optional(),
  // AI usage enabled — master switch. Set to 'false' to disable all LLM calls.
  TI_AI_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Daily AI budget per tenant (USD). 0 = unlimited. Default $0.50 for dev.
  TI_AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(0.50),
  // Max articles to triage with AI per feed fetch. Limits Haiku calls.
  TI_AI_MAX_TRIAGE_PER_FETCH: z.coerce.number().int().min(0).default(10),
  // Max articles for deep extraction per feed fetch. Limits Sonnet calls.
  TI_AI_MAX_EXTRACTION_PER_FETCH: z.coerce.number().int().min(0).default(5),
  // Triage model override (for future admin panel control)
  TI_AI_TRIAGE_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  // Extraction model override
  TI_AI_EXTRACTION_MODEL: z.string().default('claude-sonnet-4-20250514'),
  // Customization service URL — used to fetch per-tenant subtask model assignments
  TI_CUSTOMIZATION_URL: z.string().default('http://localhost:3017'),

  // ── External Feed API Keys ───────────────────────────────────────────────
  // AlienVault OTX — required for subscribed pulses endpoint. Get from otx.alienvault.com.
  TI_OTX_API_KEY: z.string().optional(),

  // ── NVD Connector ──────────────────────────────────────────────────────
  // NVD API key for higher rate limits (50 req/30s vs 5 req/30s unauthenticated).
  TI_NVD_API_KEY: z.string().optional(),

  // ── STIX/TAXII 2.1 Connector ──────────────────────────────────────────
  // TAXII 2.1 server discovery URL (e.g. https://cti-taxii.mitre.org/taxii2).
  TI_TAXII_URL: z.string().optional(),
  // TAXII basic auth credentials (optional — some feeds are public).
  TI_TAXII_USER: z.string().optional(),
  TI_TAXII_PASSWORD: z.string().optional(),
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
