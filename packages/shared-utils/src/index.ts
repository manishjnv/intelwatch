/**
 * @module @etip/shared-utils
 * @description Shared utilities, constants, and error classes for ETIP.
 * All services import constants and helpers from this package.
 *
 * @example
 * ```typescript
 * import { QUEUES, EVENTS, AppError, sha256, sleep } from '@etip/shared-utils';
 * ```
 */

// ── Queue & Event constants ────────────────────────────────────────
export { QUEUES, type QueueName, ALL_QUEUE_NAMES } from './queues.js';
export { EVENTS, type EventType, ALL_EVENT_TYPES } from './events.js';

// ── Error handling ─────────────────────────────────────────────────
export { AppError, Errors } from './errors.js';

// ── Date utilities ─────────────────────────────────────────────────
export {
  formatDate,
  parseDate,
  getDateKey,
  subDays,
  addDays,
  daysBetween,
  isOlderThan,
  nowISO,
} from './date-helpers.js';

// ── Cryptographic utilities ────────────────────────────────────────
export { sha256, md5, buildDedupeKey } from './hash.js';

// ── IP validation ──────────────────────────────────────────────────
export {
  isPrivateIP,
  isValidIPv4,
  isValidIPv6,
  isValidIP,
  classifyIP,
} from './ip-validation.js';

// ── STIX utilities ─────────────────────────────────────────────────
export { generateStixId, isValidStixId, extractStixType } from './stix-id.js';

// ── Async utilities ────────────────────────────────────────────────
export { sleep, retryWithBackoff } from './sleep.js';

// ── Prometheus metrics ────────────────────────────────────────────
export { registerMetrics, type MetricsCompatibleApp } from './metrics.js';

// ── Bloom Filter ──────────────────────────────────────────────────
export {
  createBloomFilter,
  murmurhash3,
  optimalBitCount,
  optimalHashCount,
  type BloomFilter,
  type BloomFilterStats,
  type BloomRedisClient,
  type BloomRedisPipeline,
  type CreateBloomFilterOptions,
} from './bloom-filter.js';

// ── AI Model Registry ────────────────────────────────────────────
export {
  MODEL_CATALOG,
  PROVIDER_META,
  ALL_SUBTASKS,
  getModelById,
  getModelsByProvider,
  getBestAccuracy,
  getBestCost,
  getAccuracy,
  estimatePerItemCost,
  type AiProvider,
  type ModelTier,
  type ModelPricing,
  type SubtaskBenchmark,
  type ModelDefinition,
  type Subtask,
} from './model-registry.js';
