import { randomUUID } from 'node:crypto';
import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert } from '../schemas/drp.js';
import type { CorrelationCluster, SharedInfra } from '../schemas/p1-p2.js';
import type { DRPGraphIntegration } from './graph-integration.js';

/** #15 Cross-alert correlation + graph push — shared infra detection, push to graph. */
export class CrossAlertCorrelation {
  private readonly store: DRPStore;
  private readonly graphIntegration: DRPGraphIntegration;

  constructor(store: DRPStore, graphIntegration: DRPGraphIntegration) {
    this.store = store;
    this.graphIntegration = graphIntegration;
  }

  /** Correlate alerts for shared infrastructure, temporal clusters, multi-vector attacks. */
  correlate(
    tenantId: string,
    alertIds: string[] | undefined,
    autoDetect: boolean,
    minClusterSize: number,
    pushToGraph: boolean,
  ): { clusters: CorrelationCluster[]; totalCorrelated: number } {
    const alerts = this.resolveAlerts(tenantId, alertIds);
    const clusters: CorrelationCluster[] = [];

    if (autoDetect) {
      // Shared hosting detection
      const hostingClusters = this.detectSharedHosting(tenantId, alerts, minClusterSize);
      clusters.push(...hostingClusters);

      // Temporal clustering (alerts within 1-hour windows)
      const temporalClusters = this.detectTemporalClusters(tenantId, alerts, minClusterSize);
      clusters.push(...temporalClusters);

      // Multi-vector detection (same asset, multiple alert types)
      const multiVectorClusters = this.detectMultiVector(tenantId, alerts, minClusterSize);
      clusters.push(...multiVectorClusters);
    } else if (alertIds && alertIds.length >= minClusterSize) {
      // Manual correlation of specified alerts
      const manual = this.createManualCluster(tenantId, alerts);
      if (manual) clusters.push(manual);
    }

    // Deduplicate overlapping clusters
    const dedupedClusters = this.deduplicateClusters(clusters);

    // Store clusters
    for (const cluster of dedupedClusters) {
      this.store.setCorrelation(tenantId, cluster);
    }

    // Push to graph if enabled
    if (pushToGraph && dedupedClusters.length > 0) {
      const allAlertIds = new Set(dedupedClusters.flatMap((c) => c.alertIds));
      const pushAlerts = alerts.filter((a) => allAlertIds.has(a.id));
      this.graphIntegration.pushAlerts(tenantId, pushAlerts).catch(() => { /* fire and forget */ });
    }

    const totalCorrelated = new Set(dedupedClusters.flatMap((c) => c.alertIds)).size;
    return { clusters: dedupedClusters, totalCorrelated };
  }

  /** Get all correlation clusters for a tenant. */
  getClusters(tenantId: string): CorrelationCluster[] {
    return Array.from(this.store.getTenantCorrelations(tenantId).values());
  }

  /** Detect alerts sharing hosting infrastructure. */
  private detectSharedHosting(
    tenantId: string,
    alerts: DRPAlert[],
    minSize: number,
  ): CorrelationCluster[] {
    const hostingMap = new Map<string, string[]>();

    for (const alert of alerts) {
      for (const ev of alert.evidence) {
        const provider = ev.data['hostingProvider'] as string | undefined;
        if (provider) {
          const existing = hostingMap.get(provider) ?? [];
          existing.push(alert.id);
          hostingMap.set(provider, existing);
        }
      }
    }

    const clusters: CorrelationCluster[] = [];
    for (const [provider, ids] of hostingMap) {
      const unique = [...new Set(ids)];
      if (unique.length >= minSize) {
        clusters.push({
          id: randomUUID(),
          tenantId,
          alertIds: unique,
          sharedInfrastructure: [{
            type: 'hosting_provider',
            value: provider,
            alertIds: unique,
          }],
          correlationType: 'shared_hosting',
          confidence: Math.min(1, 0.5 + unique.length * 0.1),
          description: `${unique.length} alerts share hosting provider: ${provider}`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return clusters;
  }

  /** Detect temporal clusters — alerts within a 1-hour window. */
  private detectTemporalClusters(
    tenantId: string,
    alerts: DRPAlert[],
    minSize: number,
  ): CorrelationCluster[] {
    const WINDOW_MS = 3600000; // 1 hour
    const sorted = [...alerts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const clusters: CorrelationCluster[] = [];

    let windowStart = 0;
    for (let i = 0; i < sorted.length; i++) {
      const tI = new Date(sorted[i]!.createdAt).getTime();

      // Move window start forward
      while (windowStart < i) {
        const tStart = new Date(sorted[windowStart]!.createdAt).getTime();
        if (tI - tStart > WINDOW_MS) windowStart++;
        else break;
      }

      const windowSize = i - windowStart + 1;
      if (windowSize >= minSize) {
        const windowAlerts = sorted.slice(windowStart, i + 1);
        const alertIds = windowAlerts.map((a) => a.id);
        clusters.push({
          id: randomUUID(),
          tenantId,
          alertIds,
          sharedInfrastructure: [],
          correlationType: 'temporal_cluster',
          confidence: Math.min(1, 0.4 + windowSize * 0.1),
          description: `${windowSize} alerts within 1-hour window starting ${sorted[windowStart]!.createdAt}`,
          createdAt: new Date().toISOString(),
        });
        // Skip ahead to avoid overlapping clusters
        windowStart = i + 1;
      }
    }

    return clusters;
  }

  /** Detect multi-vector attacks — same asset targeted by multiple alert types. */
  private detectMultiVector(
    tenantId: string,
    alerts: DRPAlert[],
    minSize: number,
  ): CorrelationCluster[] {
    const assetTypes = new Map<string, Map<string, string[]>>();

    for (const alert of alerts) {
      if (!assetTypes.has(alert.assetId)) {
        assetTypes.set(alert.assetId, new Map());
      }
      const typeMap = assetTypes.get(alert.assetId)!;
      const existing = typeMap.get(alert.type) ?? [];
      existing.push(alert.id);
      typeMap.set(alert.type, existing);
    }

    const clusters: CorrelationCluster[] = [];
    for (const [assetId, typeMap] of assetTypes) {
      if (typeMap.size >= 2) {
        const allIds = [...typeMap.values()].flat();
        if (allIds.length >= minSize) {
          const types = [...typeMap.keys()];
          clusters.push({
            id: randomUUID(),
            tenantId,
            alertIds: [...new Set(allIds)],
            sharedInfrastructure: [{
              type: 'ip', // conceptual — shared asset
              value: assetId,
              alertIds: [...new Set(allIds)],
            }],
            correlationType: 'multi_vector',
            confidence: Math.min(1, 0.6 + types.length * 0.1),
            description: `Multi-vector: asset ${assetId} targeted by ${types.join(', ')}`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return clusters;
  }

  private createManualCluster(tenantId: string, alerts: DRPAlert[]): CorrelationCluster | null {
    if (alerts.length < 2) return null;

    const sharedInfra = this.findSharedInfra(alerts);
    return {
      id: randomUUID(),
      tenantId,
      alertIds: alerts.map((a) => a.id),
      sharedInfrastructure: sharedInfra,
      correlationType: sharedInfra.length > 0 ? 'shared_hosting' : 'temporal_cluster',
      confidence: 0.7,
      description: `Manual correlation of ${alerts.length} alerts`,
      createdAt: new Date().toISOString(),
    };
  }

  private findSharedInfra(alerts: DRPAlert[]): SharedInfra[] {
    const infraMap = new Map<string, string[]>();
    for (const alert of alerts) {
      for (const ev of alert.evidence) {
        const provider = ev.data['hostingProvider'] as string | undefined;
        if (provider) {
          const key = `hosting_provider:${provider}`;
          const existing = infraMap.get(key) ?? [];
          existing.push(alert.id);
          infraMap.set(key, existing);
        }
      }
    }

    const result: SharedInfra[] = [];
    for (const [key, ids] of infraMap) {
      if (ids.length >= 2) {
        const [type, value] = key.split(':') as [SharedInfra['type'], string];
        result.push({ type, value, alertIds: [...new Set(ids)] });
      }
    }
    return result;
  }

  private resolveAlerts(tenantId: string, alertIds: string[] | undefined): DRPAlert[] {
    if (alertIds && alertIds.length > 0) {
      return alertIds
        .map((id) => this.store.getAlert(tenantId, id))
        .filter((a): a is DRPAlert => a !== undefined);
    }
    return Array.from(this.store.getTenantAlerts(tenantId).values());
  }

  /** Deduplicate clusters that share >80% of their alert IDs. */
  private deduplicateClusters(clusters: CorrelationCluster[]): CorrelationCluster[] {
    const result: CorrelationCluster[] = [];
    const used = new Set<number>();

    for (let i = 0; i < clusters.length; i++) {
      if (used.has(i)) continue;
      let best = clusters[i]!;

      for (let j = i + 1; j < clusters.length; j++) {
        if (used.has(j)) continue;
        const overlap = this.overlapRatio(best.alertIds, clusters[j]!.alertIds);
        if (overlap > 0.8) {
          // Keep the larger cluster
          if (clusters[j]!.alertIds.length > best.alertIds.length) {
            best = clusters[j]!;
          }
          used.add(j);
        }
      }

      result.push(best);
      used.add(i);
    }

    return result;
  }

  private overlapRatio(a: string[], b: string[]): number {
    const setA = new Set(a);
    const intersection = b.filter((id) => setA.has(id)).length;
    return intersection / Math.min(a.length, b.length);
  }
}
