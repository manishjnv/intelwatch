/**
 * #15 — Threat-Graph Integration
 * Pushes correlation results to the graph service as typed relationships
 * via HTTP API with service JWT auth. Maps correlation types to existing
 * graph relationship types. Graceful degradation when graph service is down.
 */
import { signServiceToken } from '@etip/shared-auth';
import type pino from 'pino';
import type {
  CorrelatedIOC, CorrelationResult, CorrelationType, GraphSyncResult,
} from '../schemas/correlation.js';

export interface GraphIntegrationConfig {
  graphServiceUrl: string;
  syncEnabled: boolean;
  maxRelationshipsPerBatch: number;
  maxRetries: number;
  retryDelayMs: number;
}

type GraphRelType = 'RESOLVES_TO' | 'HOSTED_ON' | 'OBSERVED_IN' | 'INDICATES';

interface BatchRelationship {
  fromNodeId: string;
  toNodeId: string;
  type: GraphRelType;
  confidence: number;
  source: 'auto-detected';
  properties: Record<string, unknown>;
}

/** Map correlation types to existing graph relationship types. */
const CORRELATION_TO_GRAPH_TYPE: Record<CorrelationType, GraphRelType> = {
  cooccurrence: 'RESOLVES_TO',
  infrastructure_overlap: 'HOSTED_ON',
  campaign_cluster: 'OBSERVED_IN',
  ttp_similarity: 'INDICATES',
  cross_entity_inference: 'INDICATES',
  temporal_wave: 'RESOLVES_TO',
};

const DEFAULT_CONFIG: GraphIntegrationConfig = {
  graphServiceUrl: 'http://threat-graph:3012',
  syncEnabled: false,
  maxRelationshipsPerBatch: 1000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

export class GraphIntegrationService {
  private readonly config: GraphIntegrationConfig;

  constructor(
    config: Partial<GraphIntegrationConfig>,
    private readonly logger: pino.Logger,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Check if graph sync is enabled. */
  isEnabled(): boolean {
    return this.config.syncEnabled;
  }

  /** Push correlation results to threat-graph as relationships. */
  async pushCorrelations(
    tenantId: string,
    results: CorrelationResult[],
    iocs: Map<string, CorrelatedIOC>,
  ): Promise<GraphSyncResult> {
    const startMs = Date.now();

    if (!this.isEnabled()) {
      return { relationshipsCreated: 0, relationshipsFailed: 0, errors: [], durationMs: 0 };
    }

    // Map all correlation results to graph relationships
    const allRelationships: BatchRelationship[] = [];
    for (const result of results) {
      if (result.suppressed) continue;
      const rels = this.mapCorrelationToGraphRelationships(result, iocs);
      allRelationships.push(...rels);
    }

    if (allRelationships.length === 0) {
      return { relationshipsCreated: 0, relationshipsFailed: 0, errors: [], durationMs: Date.now() - startMs };
    }

    // Chunk into batches of maxRelationshipsPerBatch
    let totalCreated = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < allRelationships.length; i += this.config.maxRelationshipsPerBatch) {
      const chunk = allRelationships.slice(i, i + this.config.maxRelationshipsPerBatch);
      const result = await this.sendBatch(tenantId, chunk);
      totalCreated += result.created;
      totalFailed += result.failed;
      allErrors.push(...result.errors);
    }

    const durationMs = Date.now() - startMs;
    this.logger.info({ tenantId, created: totalCreated, failed: totalFailed, durationMs }, 'Graph sync complete');

    return { relationshipsCreated: totalCreated, relationshipsFailed: totalFailed, errors: allErrors, durationMs };
  }

  /** Map a single correlation result to graph batch relationships. */
  mapCorrelationToGraphRelationships(
    result: CorrelationResult,
    iocs: Map<string, CorrelatedIOC>,
  ): BatchRelationship[] {
    const graphType = CORRELATION_TO_GRAPH_TYPE[result.correlationType] ?? 'INDICATES';
    const relationships: BatchRelationship[] = [];

    // Create pairwise relationships between entities in the correlation
    const entities = result.entities.filter((e) => iocs.has(e.entityId));
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const from = entities[i]!;
        const to = entities[j]!;

        relationships.push({
          fromNodeId: from.entityId,
          toNodeId: to.entityId,
          type: graphType,
          confidence: result.confidence,
          source: 'auto-detected',
          properties: {
            correlationType: result.correlationType,
            correlationId: result.id,
            severity: result.severity,
            ruleId: result.ruleId,
            campaignId: result.campaignId,
          },
        });
      }
    }

    return relationships;
  }

  // ── Private ────────────────────────────────────────────────────

  /** Send a batch of relationships to the graph service with retry. */
  private async sendBatch(
    _tenantId: string,
    relationships: BatchRelationship[],
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    const url = `${this.config.graphServiceUrl}/api/v1/graph/batch`;

    try {
      const response = await this.withRetry(async () => {
        const token = this.getServiceToken();
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Service-Token': token,
          },
          body: JSON.stringify({
            nodes: [],
            relationships: relationships.map((r) => ({
              fromNodeId: r.fromNodeId,
              toNodeId: r.toNodeId,
              type: r.type,
              confidence: r.confidence,
              source: r.source,
            })),
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => 'Unknown error');
          throw new Error(`Graph API returned ${res.status}: ${text}`);
        }

        return res.json();
      }, this.config.maxRetries);

      const data = response?.data ?? response;
      return {
        created: Number(data?.relationshipsCreated ?? 0),
        failed: Number(data?.relationshipsFailed ?? 0),
        errors: Array.isArray(data?.errors) ? data.errors.map((e: { error?: string }) => e.error ?? String(e)) : [],
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error({ error: msg }, 'Graph batch sync failed');
      return { created: 0, failed: relationships.length, errors: [msg] };
    }
  }

  /** Generate service JWT for inter-service auth. */
  private getServiceToken(): string {
    return signServiceToken('correlation-engine', 'threat-graph');
  }

  /** Retry with exponential backoff. */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError!;
  }
}
