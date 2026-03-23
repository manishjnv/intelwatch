/**
 * #2 — Shared Infrastructure Clustering
 * ASN/netblock/registrar overlap scoring.
 * Detects IOCs sharing C2 infrastructure attributes.
 */
import { randomUUID } from 'crypto';
import type {
  CorrelatedIOC, CorrelationResult, CorrelatedEntity,
} from '../schemas/correlation.js';

export interface InfraCluster {
  attribute: string;
  attributeType: 'asn' | 'cidrPrefix' | 'registrar';
  iocIds: string[];
  overlapScore: number;
}

export class InfrastructureClusterService {
  /** Group IOCs by shared infrastructure attributes */
  detectClusters(tenantId: string, iocs: Map<string, CorrelatedIOC>): InfraCluster[] {
    const asnMap = new Map<string, string[]>();
    const cidrMap = new Map<string, string[]>();
    const registrarMap = new Map<string, string[]>();

    for (const ioc of iocs.values()) {
      if (ioc.tenantId !== tenantId) continue;
      if (ioc.asn) {
        const list = asnMap.get(ioc.asn) ?? [];
        list.push(ioc.id);
        asnMap.set(ioc.asn, list);
      }
      if (ioc.cidrPrefix) {
        const list = cidrMap.get(ioc.cidrPrefix) ?? [];
        list.push(ioc.id);
        cidrMap.set(ioc.cidrPrefix, list);
      }
      if (ioc.registrar) {
        const list = registrarMap.get(ioc.registrar) ?? [];
        list.push(ioc.id);
        registrarMap.set(ioc.registrar, list);
      }
    }

    const clusters: InfraCluster[] = [];
    const totalIOCs = this.countTenantIOCs(tenantId, iocs);

    for (const [asn, ids] of asnMap) {
      if (ids.length >= 2) {
        clusters.push({
          attribute: asn,
          attributeType: 'asn',
          iocIds: ids,
          overlapScore: this.computeOverlapScore(ids.length, totalIOCs),
        });
      }
    }

    for (const [cidr, ids] of cidrMap) {
      if (ids.length >= 2) {
        clusters.push({
          attribute: cidr,
          attributeType: 'cidrPrefix',
          iocIds: ids,
          overlapScore: this.computeOverlapScore(ids.length, totalIOCs),
        });
      }
    }

    for (const [registrar, ids] of registrarMap) {
      if (ids.length >= 2) {
        clusters.push({
          attribute: registrar,
          attributeType: 'registrar',
          iocIds: ids,
          overlapScore: this.computeOverlapScore(ids.length, totalIOCs),
        });
      }
    }

    return clusters.sort((a, b) => b.overlapScore - a.overlapScore);
  }

  /** Overlap score: proportion of IOCs sharing the attribute, scaled logarithmically */
  computeOverlapScore(clusterSize: number, totalIOCs: number): number {
    if (totalIOCs === 0) return 0;
    const proportion = clusterSize / totalIOCs;
    const sizeFactor = Math.min(1, Math.log2(clusterSize) / 4);
    return Math.round(proportion * sizeFactor * 1000) / 1000;
  }

  /** Convert infrastructure clusters to CorrelationResults */
  toCorrelationResults(
    tenantId: string,
    clusters: InfraCluster[],
    iocs: Map<string, CorrelatedIOC>,
  ): CorrelationResult[] {
    return clusters.map((cluster) => {
      const entities: CorrelatedEntity[] = cluster.iocIds.map((id) => {
        const ioc = iocs.get(id);
        return {
          entityId: id,
          entityType: 'ioc' as const,
          label: ioc?.value ?? id,
          role: 'related' as const,
          confidence: cluster.overlapScore,
        };
      });
      if (entities.length > 0) entities[0]!.role = 'primary';

      const severity = cluster.iocIds.length >= 10 ? 'CRITICAL'
        : cluster.iocIds.length >= 5 ? 'HIGH'
        : cluster.iocIds.length >= 3 ? 'MEDIUM'
        : 'LOW';

      return {
        id: randomUUID(),
        tenantId,
        correlationType: 'infrastructure_overlap' as const,
        severity: severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        confidence: cluster.overlapScore,
        entities,
        metadata: {
          attribute: cluster.attribute,
          attributeType: cluster.attributeType,
          clusterSize: cluster.iocIds.length,
        },
        suppressed: false,
        ruleId: `infra-${cluster.attributeType}`,
        createdAt: new Date().toISOString(),
      };
    });
  }

  private countTenantIOCs(tenantId: string, iocs: Map<string, CorrelatedIOC>): number {
    let count = 0;
    for (const ioc of iocs.values()) {
      if (ioc.tenantId === tenantId) count++;
    }
    return count;
  }
}
