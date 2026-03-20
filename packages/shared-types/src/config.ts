/**
 * @module @etip/shared-types/config
 * @description Platform configuration types — AI model config, cache TTLs,
 * feed config, and system-level settings.
 */
import { z } from 'zod';

/** AI model identifiers used across the platform */
export const AI_MODELS = {
  default: 'claude-sonnet-4-20250514',
  fast:    'claude-haiku-4-5-20251001',
  heavy:   'claude-opus-4-6',
} as const;

/** Model configuration for AI enrichment routing */
export const ModelConfigSchema = z.object({
  modelId: z.string(),
  displayName: z.string(),
  maxTokens: z.number().int().min(1).default(1000),
  temperature: z.number().min(0).max(2).default(0.1),
  costPer1kInput: z.number().min(0),
  costPer1kOutput: z.number().min(0),
  rateLimit: z.number().int().min(1).default(60),
  tasks: z.array(z.string()).default([]),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** Cache TTL configuration (in seconds) — from 00-CLAUDE-INSTRUCTIONS.md */
export const CACHE_TTL = {
  dashboard:   48 * 3600,   // 48 hours
  iocSearch:   3600,         // 1 hour
  enrichment: {
    ip:     3600,            // 1 hour
    domain: 86400,           // 24 hours
    hash:   604800,          // 7 days
    cve:    43200,           // 12 hours
  },
  userSession: 900,          // 15 min
  feedData:    1800,         // 30 min
} as const;

/** Cache TTL schema for runtime validation */
export const CacheTTLSchema = z.object({
  dashboard: z.number().int().min(0),
  iocSearch: z.number().int().min(0),
  enrichment: z.object({
    ip: z.number().int().min(0),
    domain: z.number().int().min(0),
    hash: z.number().int().min(0),
    cve: z.number().int().min(0),
  }),
  userSession: z.number().int().min(0),
  feedData: z.number().int().min(0),
});
export type CacheTTLConfig = z.infer<typeof CacheTTLSchema>;

/** Platform-wide constants */
export const PLATFORM_CONSTANTS = {
  ARCHIVE_AFTER_DAYS: 60,
  MAX_FILE_LINES: 400,
  API_VERSION: 'v1',
  DEFAULT_PAGE_LIMIT: 50,
  MAX_PAGE_LIMIT: 500,
  SCHEMA_VERSION: '3.0',
} as const;

/** Feed configuration schema */
export const FeedConfigSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  url: z.string().url(),
  feedType: z.enum(['stix', 'misp', 'csv', 'json', 'rest']),
  authType: z.enum(['none', 'api_key', 'bearer', 'basic', 'oauth2']).default('none'),
  authConfig: z.record(z.string(), z.string()).optional(),
  schedule: z.string().default('0 */6 * * *'),
  enabled: z.boolean().default(true),
  reliability: z.number().min(0).max(100).default(50),
  defaultTlp: z.enum(['WHITE', 'GREEN', 'AMBER', 'RED']).default('AMBER'),
  tags: z.array(z.string()).default([]),
  lastFetchedAt: z.string().datetime().optional(),
  lastStatus: z.enum(['success', 'error', 'pending']).default('pending'),
  errorCount: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FeedConfig = z.infer<typeof FeedConfigSchema>;

/** Environment-level config schema (validated at startup) */
export const EnvConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ELASTICSEARCH_URL: z.string().url(),
  NEO4J_URL: z.string().url(),
  NEO4J_USER: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  TI_SERVICE_JWT_SECRET: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});
export type EnvConfig = z.infer<typeof EnvConfigSchema>;
