import type { IocClient } from '../clients/ioc-client.js';
import { mapIocRecord } from './ioc-graph-mapper.js';
import type { GraphSyncWriter } from './graph-sync.js';
import type pino from 'pino';

export interface IocSyncOutcome {
  nodeId: string;
  riskScore: number;
}

/** Single-IOC sync path — used by the sync_ioc queue job and the legacy upsert_node fallback. */
export class IocSyncService {
  constructor(
    private readonly client: IocClient,
    private readonly writer: GraphSyncWriter,
    private readonly logger: pino.Logger,
  ) {}

  /** Fetches, maps and writes one IOC. Returns the resulting node's risk score, or null if deleted/skipped. */
  async syncIoc(tenantId: string, iocId: string): Promise<IocSyncOutcome | null> {
    const rec = await this.client.getIoc(tenantId, iocId);
    if (!rec) {
      await this.writer.applyPlans(tenantId, [{ action: 'delete', id: iocId }]);
      return null;
    }

    const plan = mapIocRecord(rec);
    if (!plan) {
      this.logger.warn({ tenantId, iocId }, 'Skipping IOC with invalid mapped shape (e.g. bad CVE id)');
      return null;
    }

    await this.writer.applyPlans(tenantId, [plan]);
    if (plan.action === 'delete') return null;

    await this.writer.rollupEntityRisk(tenantId, plan.entities.map((e) => e.id));
    return { nodeId: plan.primary.id, riskScore: Number(plan.primary.props['baseRiskScore'] ?? 0) };
  }
}
