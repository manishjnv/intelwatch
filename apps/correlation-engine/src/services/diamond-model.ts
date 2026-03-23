/**
 * #7 — Diamond Model Auto-Mapping
 * Classifies correlated entities into Diamond Model facets:
 *   adversary, capability, infrastructure, victim
 * Uses entity type + IOC type to determine facet assignment.
 */
import type {
  CorrelatedEntity, DiamondMapping, EntityType,
} from '../schemas/correlation.js';

/** Maps entity types and IOC sub-types to Diamond Model facets */
const ENTITY_FACET_MAP: Record<string, 'adversary' | 'capability' | 'infrastructure' | 'victim'> = {
  // Entity types
  'threat_actor': 'adversary',
  'malware': 'capability',
  'vulnerability': 'capability',
};

/** IOC types mapped to Diamond facets */
const IOC_FACET_MAP: Record<string, 'adversary' | 'capability' | 'infrastructure' | 'victim'> = {
  'ip': 'infrastructure',
  'ipv6': 'infrastructure',
  'domain': 'infrastructure',
  'fqdn': 'infrastructure',
  'url': 'infrastructure',
  'cidr': 'infrastructure',
  'asn': 'infrastructure',
  'email': 'adversary',
  'md5': 'capability',
  'sha1': 'capability',
  'sha256': 'capability',
  'sha512': 'capability',
  'cve': 'capability',
  'bitcoin_address': 'adversary',
};

export class DiamondModelService {
  /** Classify a single entity into a Diamond Model facet */
  classifyEntity(
    entityId: string,
    entityType: EntityType,
    label: string,
    iocType?: string,
    confidence: number = 0.5,
  ): DiamondMapping {
    let facet: 'adversary' | 'capability' | 'infrastructure' | 'victim';

    if (entityType === 'ioc' && iocType) {
      facet = IOC_FACET_MAP[iocType] ?? 'infrastructure';
    } else {
      facet = ENTITY_FACET_MAP[entityType] ?? 'infrastructure';
    }

    return { facet, entityId, entityType, label, confidence };
  }

  /** Map a set of correlated entities to Diamond Model facets */
  mapCorrelation(
    entities: CorrelatedEntity[],
    iocTypeMap: Map<string, string>, // entityId -> iocType
  ): DiamondMapping[] {
    return entities.map((entity) => {
      const iocType = iocTypeMap.get(entity.entityId);
      return this.classifyEntity(
        entity.entityId,
        entity.entityType,
        entity.label,
        iocType,
        entity.confidence,
      );
    });
  }

  /** Check if a Diamond mapping has all four facets represented */
  isCompleteDiamond(mappings: DiamondMapping[]): boolean {
    const facets = new Set(mappings.map((m) => m.facet));
    return facets.size === 4;
  }

  /** Get facet distribution from mappings */
  facetDistribution(mappings: DiamondMapping[]): Record<string, number> {
    const dist: Record<string, number> = {
      adversary: 0, capability: 0, infrastructure: 0, victim: 0,
    };
    for (const m of mappings) {
      dist[m.facet] = (dist[m.facet] ?? 0) + 1;
    }
    return dist;
  }

  /** Group mappings by facet */
  groupByFacet(mappings: DiamondMapping[]): Record<string, DiamondMapping[]> {
    const groups: Record<string, DiamondMapping[]> = {
      adversary: [], capability: [], infrastructure: [], victim: [],
    };
    for (const m of mappings) {
      groups[m.facet]!.push(m);
    }
    return groups;
  }

  /** Get the IOC type to facet mapping (for external use) */
  getIOCFacetMap(): Record<string, string> {
    return { ...IOC_FACET_MAP };
  }
}
