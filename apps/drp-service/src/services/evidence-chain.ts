import type { DRPStore } from '../schemas/store.js';
import type { EvidenceChain, EvidenceStep, ConfidenceReason, DRPSeverity } from '../schemas/drp.js';

/**
 * #3 Evidence Chain Builder.
 *
 * Constructs a linked audit trail from initial detection signal through
 * scoring, deduplication, and alert creation. Enables analysts to trace
 * exactly why an alert was created and how confidence was computed.
 */
export class EvidenceChainBuilder {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /** Build a complete evidence chain for an alert. */
  buildChain(
    tenantId: string,
    alertId: string,
    context: {
      signals: Array<{ signalType: string; rawValue: number; description: string }>;
      confidence: number;
      reasons: ConfidenceReason[];
      severity: DRPSeverity;
      deduped: boolean;
    },
  ): EvidenceChain {
    const now = new Date().toISOString();
    const steps: EvidenceStep[] = [];
    let order = 1;

    // Step 1: Detection signals
    for (const signal of context.signals) {
      steps.push({
        order: order++,
        type: 'detection',
        description: `Signal detected: ${signal.signalType} (value: ${signal.rawValue.toFixed(3)})`,
        data: {
          signalType: signal.signalType,
          rawValue: signal.rawValue,
          description: signal.description,
        },
        timestamp: now,
      });
    }

    // Step 2: Confidence scoring
    steps.push({
      order: order++,
      type: 'scoring',
      description: `Confidence computed: ${(context.confidence * 100).toFixed(1)}% from ${context.reasons.length} signals`,
      data: {
        confidence: context.confidence,
        reasons: context.reasons.map((r) => ({
          signal: r.signal,
          weight: r.weight,
          value: r.value,
          contribution: r.weight * r.value,
        })),
      },
      timestamp: now,
    });

    // Step 3: Dedup check
    steps.push({
      order: order++,
      type: 'dedup',
      description: context.deduped
        ? 'Duplicate detected — merged evidence into existing alert'
        : 'No duplicate found — creating new alert',
      data: { deduped: context.deduped },
      timestamp: now,
    });

    // Step 4: Severity classification
    steps.push({
      order: order++,
      type: 'classification',
      description: `Severity classified as ${context.severity}`,
      data: { severity: context.severity, confidence: context.confidence },
      timestamp: now,
    });

    // Step 5: Alert creation
    steps.push({
      order: order++,
      type: 'alert_created',
      description: `Alert created with ${context.severity} severity and ${(context.confidence * 100).toFixed(1)}% confidence`,
      data: { alertId, severity: context.severity, confidence: context.confidence },
      timestamp: now,
    });

    const chain: EvidenceChain = {
      alertId,
      tenantId,
      steps,
      createdAt: now,
    };

    this.store.setEvidenceChain(tenantId, chain);
    return chain;
  }

  /** Get the evidence chain for an alert. */
  getChain(tenantId: string, alertId: string): EvidenceChain | undefined {
    return this.store.getEvidenceChain(tenantId, alertId);
  }

  /** Add a step to an existing evidence chain. */
  addStep(
    tenantId: string,
    alertId: string,
    step: Omit<EvidenceStep, 'order' | 'timestamp'>,
  ): EvidenceChain | undefined {
    const chain = this.store.getEvidenceChain(tenantId, alertId);
    if (!chain) return undefined;

    chain.steps.push({
      ...step,
      order: chain.steps.length + 1,
      timestamp: new Date().toISOString(),
    });

    this.store.setEvidenceChain(tenantId, chain);
    return chain;
  }
}
