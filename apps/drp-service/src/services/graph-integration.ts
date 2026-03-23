import { signServiceToken } from '@etip/shared-auth';
import { getLogger } from '../logger.js';

export interface DRPGraphConfig {
  graphServiceUrl: string;
  syncEnabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

interface GraphSyncResult {
  created: number;
  failed: number;
  errors: string[];
}

/** Push DRP entities to the threat graph service via HTTP + service JWT. */
export class DRPGraphIntegration {
  private readonly config: DRPGraphConfig;

  constructor(config: DRPGraphConfig) {
    this.config = config;
  }

  /** Push DRP alert entities to the graph as nodes and relationships. */
  async pushAlerts(
    tenantId: string,
    alerts: Array<{
      id: string;
      type: string;
      detectedValue: string;
      assetId: string;
      severity: string;
      confidence: number;
    }>,
  ): Promise<GraphSyncResult> {
    if (!this.config.syncEnabled) {
      return { created: 0, failed: 0, errors: ['Graph sync disabled'] };
    }

    if (alerts.length === 0) {
      return { created: 0, failed: 0, errors: [] };
    }

    const logger = getLogger();
    const url = `${this.config.graphServiceUrl}/api/v1/graph/batch`;

    try {
      const result = await this.withRetry(async () => {
        const token = this.getServiceToken();
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Service-Token': token,
          },
          body: JSON.stringify({
            nodes: alerts.map((a) => ({
              id: a.id,
              type: 'drp_alert',
              label: a.detectedValue,
              properties: {
                alertType: a.type,
                severity: a.severity,
                confidence: a.confidence,
                tenantId,
              },
            })),
            relationships: alerts.map((a) => ({
              fromNodeId: a.id,
              toNodeId: a.assetId,
              type: 'TARGETS',
              confidence: a.confidence,
              source: 'drp-service',
            })),
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => 'Unknown error');
          throw new Error(`Graph API returned ${res.status}: ${text}`);
        }

        return res.json();
      }, this.config.maxRetries);

      const data = result?.data ?? result;
      return {
        created: Number(data?.nodesCreated ?? 0) + Number(data?.relationshipsCreated ?? 0),
        failed: Number(data?.nodesFailed ?? 0) + Number(data?.relationshipsFailed ?? 0),
        errors: Array.isArray(data?.errors)
          ? data.errors.map((e: { error?: string }) => e.error ?? String(e))
          : [],
      };
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ error: msg }, 'Graph sync failed');
      return { created: 0, failed: alerts.length, errors: [msg] };
    }
  }

  /** Generate service JWT for inter-service auth. */
  private getServiceToken(): string {
    return signServiceToken('drp-service', 'threat-graph');
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
