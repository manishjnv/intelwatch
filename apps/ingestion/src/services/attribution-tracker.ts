/**
 * Attribution Tracker — Preserves provenance chain during deduplication.
 *
 * When merging near-duplicate articles/IOCs, competitors lose which feed reported
 * what first and which added unique context. This module maintains the full
 * attribution chain, enabling:
 * - TLP compliance (know the original source classification)
 * - Legal defensibility (prove provenance of intelligence)
 * - Analyst trust (see which feeds contributed what)
 */

export interface Attribution {
  feedId: string;
  feedName: string;
  reportedAt: Date;
  uniqueContext: string[]; // Sentences/facts this feed added that no other had
  tlp: 'WHITE' | 'GREEN' | 'AMBER' | 'RED';
  isOriginalSource: boolean; // Was this the first feed to report this IOC?
}

export interface AttributionChain {
  iocValue: string;
  iocType: string;
  tenantId: string;
  primaryAttribution: Attribution; // First reporter
  allAttributions: Attribution[];
  mergedContexts: string[]; // Union of all unique contexts
  effectiveTLP: 'WHITE' | 'GREEN' | 'AMBER' | 'RED'; // Most restrictive
  totalSources: number;
  timespan: { firstReported: Date; lastReported: Date };
}

export interface MergeDecision {
  action: 'merge' | 'create_new';
  existingId: string | null;
  attributionPreserved: boolean;
  contextAdded: string[];
  tlpChanged: boolean;
}

const TLP_RANK: Record<string, number> = {
  WHITE: 0,
  GREEN: 1,
  AMBER: 2,
  RED: 3,
};

export class AttributionTracker {
  // iocKey → attribution chain
  private readonly chains = new Map<string, AttributionChain>();

  /**
   * Add an attribution for an IOC. Builds/extends the chain.
   */
  addAttribution(
    iocValue: string,
    iocType: string,
    tenantId: string,
    attribution: Omit<Attribution, 'isOriginalSource' | 'uniqueContext'> & { context: string[] },
  ): AttributionChain {
    const key = chainKey(iocValue, iocType, tenantId);
    let chain = this.chains.get(key);

    if (!chain) {
      // First attribution — this is the original source
      const attr: Attribution = {
        ...attribution,
        isOriginalSource: true,
        uniqueContext: [...attribution.context],
      };

      chain = {
        iocValue, iocType, tenantId,
        primaryAttribution: attr,
        allAttributions: [attr],
        mergedContexts: [...attribution.context],
        effectiveTLP: attribution.tlp,
        totalSources: 1,
        timespan: { firstReported: attribution.reportedAt, lastReported: attribution.reportedAt },
      };

      this.chains.set(key, chain);
      return chain;
    }

    // Subsequent attribution — find unique context not already in the chain
    const existingContextSet = new Set(chain.mergedContexts.map(normalizeContext));
    const uniqueContext = attribution.context.filter(
      (ctx) => !existingContextSet.has(normalizeContext(ctx)),
    );

    const attr: Attribution = {
      ...attribution,
      isOriginalSource: false,
      uniqueContext,
    };

    chain.allAttributions.push(attr);
    chain.mergedContexts.push(...uniqueContext);
    chain.totalSources = chain.allAttributions.length;

    // Update effective TLP to most restrictive
    if ((TLP_RANK[attribution.tlp] ?? 0) > (TLP_RANK[chain.effectiveTLP] ?? 0)) {
      chain.effectiveTLP = attribution.tlp;
    }

    // Update timespan
    if (chain.timespan && attribution.reportedAt < chain.timespan.firstReported) {
      chain.timespan.firstReported = attribution.reportedAt;
      // Update primary attribution to the earliest reporter
      chain.primaryAttribution = attr;
      attr.isOriginalSource = true;
      // Demote previous primary
      for (const a of chain.allAttributions) {
        if (a !== attr) a.isOriginalSource = false;
      }
    }
    if (chain.timespan && attribution.reportedAt > chain.timespan.lastReported) {
      chain.timespan.lastReported = attribution.reportedAt;
    }

    return chain;
  }

  /**
   * Merge a near-duplicate article's IOC attributions into existing chains.
   * Returns per-IOC merge decisions.
   */
  mergeAttributions(
    iocValues: Array<{ value: string; type: string }>,
    tenantId: string,
    feedId: string,
    feedName: string,
    reportedAt: Date,
    contexts: string[],
    tlp: 'WHITE' | 'GREEN' | 'AMBER' | 'RED',
  ): MergeDecision[] {
    return iocValues.map((ioc) => {
      const key = chainKey(ioc.value, ioc.type, tenantId);
      const existing = this.chains.get(key);

      if (!existing) {
        // No existing chain — create new
        this.addAttribution(ioc.value, ioc.type, tenantId, {
          feedId, feedName, reportedAt, context: contexts, tlp,
        });
        return {
          action: 'create_new' as const,
          existingId: null,
          attributionPreserved: true,
          contextAdded: contexts,
          tlpChanged: false,
        };
      }

      // Existing chain — merge attribution
      const prevTLP = existing.effectiveTLP;
      const prevContextCount = existing.mergedContexts.length;

      this.addAttribution(ioc.value, ioc.type, tenantId, {
        feedId, feedName, reportedAt, context: contexts, tlp,
      });

      const contextAdded = existing.mergedContexts.slice(prevContextCount);

      return {
        action: 'merge' as const,
        existingId: key,
        attributionPreserved: true,
        contextAdded,
        tlpChanged: existing.effectiveTLP !== prevTLP,
      };
    });
  }

  /**
   * Get the full attribution chain for an IOC.
   */
  getChain(iocValue: string, iocType: string, tenantId: string): AttributionChain | null {
    return this.chains.get(chainKey(iocValue, iocType, tenantId)) ?? null;
  }

  /**
   * Get all chains for a tenant.
   */
  getChainsForTenant(tenantId: string): AttributionChain[] {
    const results: AttributionChain[] = [];
    for (const chain of this.chains.values()) {
      if (chain.tenantId === tenantId) results.push(chain);
    }
    return results;
  }

  /**
   * Get feeds contributing to an IOC, sorted by report time.
   */
  getContributors(iocValue: string, iocType: string, tenantId: string): Attribution[] {
    const chain = this.getChain(iocValue, iocType, tenantId);
    if (!chain) return [];
    return [...chain.allAttributions].sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime());
  }

  clear(): void {
    this.chains.clear();
  }
}

function chainKey(iocValue: string, iocType: string, tenantId: string): string {
  return `${tenantId}:${iocType}:${iocValue}`;
}

/** Normalize context for dedup comparison (lowercase, trim, collapse whitespace) */
function normalizeContext(ctx: string): string {
  return ctx.toLowerCase().trim().replace(/\s+/g, ' ');
}
