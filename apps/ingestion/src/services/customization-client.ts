/**
 * CustomizationClient
 *
 * Fetches per-tenant AI subtask model assignments from the customization service
 * (port 3017, GET /api/v1/customization/ai/subtasks).
 *
 * - Results are cached per-tenant for 5 minutes to avoid latency on every article.
 * - Falls back to safe Haiku/Sonnet defaults if the service is unreachable.
 * - Uses service-to-service JWT (shared-auth signServiceToken) for authentication.
 *
 * Only the 3 subtasks that map directly to pipeline stages are exposed:
 *   classification  → Stage 1 triage model
 *   ioc_extraction  → Stage 2 extraction model
 *   deduplication   → Stage 3 dedup arbitration model
 */

import { signServiceToken } from '@etip/shared-auth';
import type pino from 'pino';

/** Maps customization service model aliases → full Anthropic model IDs */
const MODEL_ID_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-6',
};

/** Defaults used when customization service is unreachable */
const DEFAULT_MODELS: SubtaskModels = {
  classification: 'claude-haiku-4-5-20251001',
  ioc_extraction: 'claude-sonnet-4-20250514',
  deduplication: 'claude-haiku-4-5-20251001',
};

/** The 3 pipeline-relevant subtask model assignments for a tenant */
export interface SubtaskModels {
  /** Stage 1 — CTI relevance classifier */
  classification: string;
  /** Stage 2 — deep IOC / entity extraction */
  ioc_extraction: string;
  /** Stage 3 — deduplication LLM arbiter */
  deduplication: string;
}

interface CacheEntry {
  models: SubtaskModels;
  expiresAt: number;
}

interface RawSubtaskMapping {
  subtask: string;
  model: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class CustomizationClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly logger?: pino.Logger,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Get the 3 pipeline-relevant subtask model IDs for a tenant.
   *
   * Results are cached for CACHE_TTL_MS. Falls back to DEFAULT_MODELS
   * if the customization service is unreachable or returns an error —
   * the pipeline must never crash because of a missing customization service.
   */
  async getSubtaskModels(tenantId: string): Promise<SubtaskModels> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.models;
    }

    try {
      const token = signServiceToken('ingestion-service', 'customization-service');
      const url = `${this.baseUrl}/api/v1/customization/ai/subtasks`;
      const res = await fetch(url, {
        headers: {
          'x-tenant-id': tenantId,
          'x-service-token': token,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from customization service`);
      }

      const body = (await res.json()) as { data: RawSubtaskMapping[] };
      const models = this.parseModels(body.data ?? []);
      this.cache.set(tenantId, { models, expiresAt: Date.now() + CACHE_TTL_MS });
      return models;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.warn({ tenantId, error: message }, 'CustomizationClient: fetch failed, using default models');
      return { ...DEFAULT_MODELS };
    }
  }

  /**
   * Invalidate cached models for a tenant.
   * Call after a PUT /ai/subtasks/:subtask succeeds if pipeline and
   * customization service are colocated in the same process (tests).
   */
  clearCache(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /** Map alias names ('haiku', 'sonnet', 'opus') to full Anthropic model IDs */
  private parseModels(data: RawSubtaskMapping[]): SubtaskModels {
    const result: SubtaskModels = { ...DEFAULT_MODELS };
    for (const entry of data) {
      const fullId = MODEL_ID_MAP[entry.model] ?? entry.model;
      if (entry.subtask === 'classification') result.classification = fullId;
      else if (entry.subtask === 'ioc_extraction') result.ioc_extraction = fullId;
      else if (entry.subtask === 'deduplication') result.deduplication = fullId;
    }
    return result;
  }
}
