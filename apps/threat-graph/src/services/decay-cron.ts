import { createSession } from '../driver.js';
import { RiskPropagationEngine } from '../propagation.js';
import type { DecayStatus, DecayRunResult } from '../schemas/operations.js';
import type pino from 'pino';

/**
 * Risk Score Decay Cron — #18.
 *
 * Periodically re-evaluates all node risk scores using temporal decay.
 * For each node: newScore = currentScore × e^(-0.01 × daysSinceLastSeen)
 * Only updates if the score drops by >= threshold (default 1.0).
 *
 * This is NOT propagation (which only raises scores per DECISION-020).
 * This is explicit scheduled decay — a separate mechanism that lowers stale scores.
 */
export class DecayCronService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRun: string | null = null;
  private lastResult: DecayRunResult | null = null;

  constructor(
    private readonly propagation: RiskPropagationEngine,
    private readonly intervalMs: number,
    private readonly threshold: number,
    private readonly logger: pino.Logger,
  ) {}

  /** Starts the decay cron job. */
  start(): void {
    if (this.timer) return;

    this.logger.info({ intervalMs: this.intervalMs, threshold: this.threshold }, 'Starting risk score decay cron');

    this.timer = setInterval(() => {
      void this.runDecayForAllTenants().catch((err) => {
        this.logger.error({ err }, 'Decay cron failed');
      });
    }, this.intervalMs);
  }

  /** Stops the decay cron job. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Decay cron stopped');
    }
  }

  /** Returns current status of the decay cron. */
  getStatus(): DecayStatus {
    return {
      running: this.timer !== null,
      intervalMs: this.intervalMs,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
    };
  }

  /** Manually triggers a decay run for a specific tenant. */
  async triggerDecay(tenantId: string): Promise<DecayRunResult> {
    return this.runDecayForTenant(tenantId);
  }

  /** Runs decay across all tenants. */
  private async runDecayForAllTenants(): Promise<void> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (n) WHERE n.tenantId IS NOT NULL
         RETURN DISTINCT n.tenantId AS tenantId`,
      );
      const tenantIds = result.records.map((r) => String(r.get('tenantId')));

      for (const tenantId of tenantIds) {
        try {
          await this.runDecayForTenant(tenantId);
        } catch (err) {
          this.logger.error({ err, tenantId }, 'Decay failed for tenant');
        }
      }
    } finally {
      await session.close();
    }
  }

  /** Runs decay for a single tenant. */
  async runDecayForTenant(tenantId: string): Promise<DecayRunResult> {
    const startTime = Date.now();
    const session = createSession();
    let nodesEvaluated = 0;
    let nodesDecayed = 0;
    let totalDecay = 0;

    try {
      // Fetch all nodes with risk scores > 0
      const result = await session.run(
        `MATCH (n {tenantId: $tenantId})
         WHERE n.riskScore > 0
         RETURN n.id AS id, n.riskScore AS riskScore, n.lastSeen AS lastSeen`,
        { tenantId },
      );

      for (const rec of result.records) {
        nodesEvaluated++;
        const nodeId = String(rec.get('id'));
        const currentScore = Number(rec.get('riskScore') ?? 0);
        const lastSeen = rec.get('lastSeen') as string | null;

        const temporalFactor = this.propagation.calculateTemporalDecay(lastSeen);
        const decayedScore = Math.round(currentScore * temporalFactor * 100) / 100;
        const scoreDrop = currentScore - decayedScore;

        if (scoreDrop >= this.threshold) {
          await session.run(
            `MATCH (n {id: $nodeId, tenantId: $tenantId})
             SET n.riskScore = $newScore`,
            { nodeId, tenantId, newScore: Math.max(0, decayedScore) },
          );
          nodesDecayed++;
          totalDecay += scoreDrop;
        }
      }

      const runResult: DecayRunResult = {
        timestamp: new Date().toISOString(),
        nodesEvaluated,
        nodesDecayed,
        avgDecayAmount: nodesDecayed > 0 ? Math.round((totalDecay / nodesDecayed) * 100) / 100 : 0,
        duration: Date.now() - startTime,
      };

      this.lastRun = runResult.timestamp;
      this.lastResult = runResult;

      this.logger.info(
        { tenantId, ...runResult },
        'Decay run complete',
      );

      return runResult;
    } finally {
      await session.close();
    }
  }
}
