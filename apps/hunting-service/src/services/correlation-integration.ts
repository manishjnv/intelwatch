import { AppError } from '@etip/shared-utils';
import { signServiceToken } from '@etip/shared-auth';
import type { HuntingStore } from '../schemas/store.js';
import type { CorrelationLead, EntityType } from '../schemas/hunting.js';
import { getLogger } from '../logger.js';

export interface CorrelationIntegrationConfig {
  correlationServiceUrl: string;
  enabled: boolean;
}

/** Shape of a correlation result from the correlation-engine API. */
interface CorrelationResult {
  id: string;
  type: string;
  confidence: number;
  entities: Array<{ type: string; value: string }>;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** Shape of the correlation service list response. */
interface CorrelationListResponse {
  data: CorrelationResult[];
  total: number;
}

/**
 * #5 Correlation Integration — pulls correlation results as hunt leads.
 *
 * Fetches recent correlations from the correlation-engine API and links
 * them to active hunt sessions. Analysts can import correlated entities
 * and use correlation confidence to prioritize investigation paths.
 */
export class CorrelationIntegration {
  private readonly store: HuntingStore;
  private readonly config: CorrelationIntegrationConfig;

  constructor(store: HuntingStore, config: CorrelationIntegrationConfig) {
    this.store = store;
    this.config = config;
  }

  /** Fetch recent correlations for a tenant from the correlation-engine. */
  async fetchCorrelations(
    tenantId: string,
    limit: number = 50,
    minConfidence: number = 0.5,
  ): Promise<CorrelationResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    const logger = getLogger();
    const token = signServiceToken('hunting-service', 'correlation-service');
    const params = new URLSearchParams({
      limit: String(limit),
      minConfidence: String(minConfidence),
    });

    const url = `${this.config.correlationServiceUrl}/api/v1/correlations?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-service-token': token,
          'x-tenant-id': tenantId,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status },
          'Correlation service returned non-OK status',
        );
        return [];
      }

      const body = (await response.json()) as CorrelationListResponse;
      return body.data;
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch correlations — service may be unavailable');
      return [];
    }
  }

  /** Link a correlation result to a hunt session as a lead. */
  linkCorrelationToHunt(
    tenantId: string,
    huntId: string,
    correlation: CorrelationResult,
  ): CorrelationLead {
    // Verify hunt exists
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }

    // Check if already linked
    const existingLeads = this.store.getHuntLeads(tenantId, huntId);
    const alreadyLinked = existingLeads.find(
      (l) => l.correlationId === correlation.id,
    );
    if (alreadyLinked) {
      return alreadyLinked;
    }

    const lead: CorrelationLead = {
      correlationId: correlation.id,
      type: correlation.type,
      confidence: correlation.confidence,
      entities: correlation.entities.map((e) => ({
        type: e.type as EntityType,
        value: e.value,
      })),
      description: correlation.description ?? `${correlation.type} correlation (${(correlation.confidence * 100).toFixed(0)}% confidence)`,
      linkedAt: new Date().toISOString(),
    };

    this.store.addLead(tenantId, huntId, lead);

    // Track the lead ID in the session
    session.correlationLeads.push(correlation.id);
    session.updatedAt = new Date().toISOString();
    this.store.setSession(tenantId, session);

    return lead;
  }

  /** Get all correlation leads for a hunt. */
  getHuntLeads(tenantId: string, huntId: string): CorrelationLead[] {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return this.store.getHuntLeads(tenantId, huntId);
  }

  /** Auto-link matching correlations to a hunt based on shared entities. */
  async autoLinkCorrelations(
    tenantId: string,
    huntId: string,
  ): Promise<CorrelationLead[]> {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }

    if (session.entities.length === 0) {
      return [];
    }

    const correlations = await this.fetchCorrelations(tenantId, 100, 0.3);
    const huntEntityValues = new Set(session.entities.map((e) => e.value));
    const linked: CorrelationLead[] = [];

    for (const correlation of correlations) {
      // Check if any correlation entity matches a hunt entity
      const hasOverlap = correlation.entities.some((e) =>
        huntEntityValues.has(e.value),
      );

      if (hasOverlap) {
        const lead = this.linkCorrelationToHunt(tenantId, huntId, correlation);
        linked.push(lead);
      }
    }

    return linked;
  }

  /** Get correlation lead statistics for a hunt. */
  getLeadStats(tenantId: string, huntId: string): {
    totalLeads: number;
    avgConfidence: number;
    byType: Record<string, number>;
    highConfidenceCount: number;
  } {
    const leads = this.getHuntLeads(tenantId, huntId);
    const byType: Record<string, number> = {};
    let totalConfidence = 0;
    let highConfidenceCount = 0;

    for (const lead of leads) {
      byType[lead.type] = (byType[lead.type] ?? 0) + 1;
      totalConfidence += lead.confidence;
      if (lead.confidence >= 0.7) highConfidenceCount++;
    }

    return {
      totalLeads: leads.length,
      avgConfidence: leads.length > 0 ? totalConfidence / leads.length : 0,
      byType,
      highConfidenceCount,
    };
  }
}
