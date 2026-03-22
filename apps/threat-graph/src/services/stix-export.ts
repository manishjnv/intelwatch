import { randomUUID } from 'crypto';
import { GraphRepository } from '../repository.js';
import type { NodeType, RelationshipType, GraphNodeResponse, GraphEdgeResponse } from '../schemas/graph.js';
import type { StixObject, StixBundle } from '../schemas/search.js';

/**
 * STIX 2.1 Bundle Export — P2 #12.
 *
 * Converts a graph subgraph to a STIX 2.1 JSON bundle.
 * Maps ETIP node types to STIX SDOs and relationships to SROs.
 *
 * @see https://docs.oasis-open.org/cti/stix/v2.1/os/stix-v2.1-os.html
 */

/** ETIP node type → STIX 2.1 SDO type. */
const NODE_TO_STIX_TYPE: Record<NodeType, string> = {
  IOC: 'indicator',
  ThreatActor: 'threat-actor',
  Malware: 'malware',
  Campaign: 'campaign',
  Infrastructure: 'infrastructure',
  Vulnerability: 'vulnerability',
  Victim: 'identity',
};

/** ETIP relationship type → STIX 2.1 relationship name. */
const REL_TO_STIX_TYPE: Record<RelationshipType, string> = {
  USES: 'uses',
  CONDUCTS: 'attributed-to',
  TARGETS: 'targets',
  CONTROLS: 'controls',
  RESOLVES_TO: 'related-to',
  HOSTED_ON: 'hosted-by',
  EXPLOITS: 'exploits',
  INDICATES: 'indicates',
  OBSERVED_IN: 'related-to',
};

export class StixExportService {
  constructor(private readonly repo: GraphRepository) {}

  /** Exports a subgraph as a STIX 2.1 bundle. */
  async exportBundle(
    tenantId: string,
    nodeId: string | undefined,
    nodeIds: string[] | undefined,
    depth: number,
  ): Promise<StixBundle> {
    let nodes: GraphNodeResponse[] = [];
    let edges: GraphEdgeResponse[] = [];

    if (nodeId) {
      // Export a single node's neighborhood
      const subgraph = await this.repo.getNHopNeighbors(tenantId, nodeId, depth, null, 500);
      const centerNode = await this.repo.getNode(tenantId, nodeId);
      nodes = subgraph.nodes;
      edges = subgraph.edges;
      if (centerNode && !nodes.some((n) => n.id === nodeId)) {
        nodes.unshift(centerNode);
      }
    } else if (nodeIds && nodeIds.length > 0) {
      // Export specific nodes and their interconnections
      const nodeMap = new Map<string, GraphNodeResponse>();
      for (const nid of nodeIds) {
        const node = await this.repo.getNode(tenantId, nid);
        if (node) nodeMap.set(nid, node);
      }
      nodes = Array.from(nodeMap.values());
      // Get edges between the specified nodes (1-hop to capture connections)
      for (const nid of nodeIds) {
        const sub = await this.repo.getNHopNeighbors(tenantId, nid, 1, null, 200);
        for (const edge of sub.edges) {
          if (nodeMap.has(edge.fromNodeId) && nodeMap.has(edge.toNodeId)) {
            if (!edges.some((e) => e.id === edge.id)) {
              edges.push(edge);
            }
          }
        }
      }
    }

    const now = new Date().toISOString();
    const objects: StixObject[] = [];

    // Convert nodes to STIX SDOs
    for (const node of nodes) {
      objects.push(this.nodeToStix(node, now));
    }

    // Convert edges to STIX SROs
    for (const edge of edges) {
      objects.push(this.edgeToStix(edge, now));
    }

    return {
      type: 'bundle',
      id: `bundle--${randomUUID()}`,
      spec_version: '2.1',
      objects,
    };
  }

  /** Converts an ETIP graph node to a STIX 2.1 SDO. */
  private nodeToStix(node: GraphNodeResponse, now: string): StixObject {
    const stixType = NODE_TO_STIX_TYPE[node.nodeType] ?? 'indicator';
    const stixId = `${stixType}--${node.id}`;
    const created = String(node.properties['firstSeen'] ?? now);
    const modified = String(node.properties['lastSeen'] ?? now);

    const base: StixObject = {
      type: stixType,
      spec_version: '2.1',
      id: stixId,
      created,
      modified,
      confidence: Math.round(node.confidence * 100),
    };

    // Type-specific properties
    switch (node.nodeType) {
      case 'IOC':
        return {
          ...base,
          name: String(node.properties['value'] ?? ''),
          pattern_type: 'stix',
          pattern: this.buildIndicatorPattern(node),
          valid_from: created,
          indicator_types: [String(node.properties['iocType'] ?? 'unknown')],
        };
      case 'ThreatActor':
        return {
          ...base,
          name: String(node.properties['name'] ?? ''),
          aliases: (node.properties['aliases'] as string[]) ?? [],
          primary_motivation: String(node.properties['motivation'] ?? 'unknown'),
        };
      case 'Malware':
        return {
          ...base,
          name: String(node.properties['name'] ?? ''),
          malware_types: [String(node.properties['malwareType'] ?? 'unknown')],
          is_family: Boolean(node.properties['family']),
        };
      case 'Campaign':
        return {
          ...base,
          name: String(node.properties['name'] ?? ''),
          first_seen: String(node.properties['startDate'] ?? created),
          last_seen: String(node.properties['endDate'] ?? modified),
        };
      case 'Infrastructure':
        return {
          ...base,
          name: String(node.properties['value'] ?? ''),
          infrastructure_types: [String(node.properties['infraType'] ?? 'unknown')],
        };
      case 'Vulnerability':
        return {
          ...base,
          name: String(node.properties['cveId'] ?? ''),
          external_references: [{
            source_name: 'cve',
            external_id: String(node.properties['cveId'] ?? ''),
          }],
        };
      case 'Victim':
        return {
          ...base,
          name: String(node.properties['name'] ?? ''),
          identity_class: 'organization',
          sectors: node.properties['industry'] ? [String(node.properties['industry'])] : [],
        };
      default:
        return { ...base, name: String(node.properties['name'] ?? node.id) };
    }
  }

  /** Converts an ETIP graph edge to a STIX 2.1 SRO. */
  private edgeToStix(edge: GraphEdgeResponse, now: string): StixObject {
    const relName = REL_TO_STIX_TYPE[edge.type] ?? 'related-to';
    return {
      type: 'relationship',
      spec_version: '2.1',
      id: `relationship--${randomUUID()}`,
      created: String(edge.properties['firstSeen'] ?? now),
      modified: String(edge.properties['lastSeen'] ?? now),
      relationship_type: relName,
      source_ref: edge.fromNodeId,
      target_ref: edge.toNodeId,
      confidence: Math.round(edge.confidence * 100),
    };
  }

  /** Builds a STIX indicator pattern from an IOC node. */
  private buildIndicatorPattern(node: GraphNodeResponse): string {
    const value = String(node.properties['value'] ?? '');
    const iocType = String(node.properties['iocType'] ?? '');

    switch (iocType) {
      case 'ip': return `[ipv4-addr:value = '${value}']`;
      case 'domain': return `[domain-name:value = '${value}']`;
      case 'url': return `[url:value = '${value}']`;
      case 'hash_md5': return `[file:hashes.'MD5' = '${value}']`;
      case 'hash_sha1': return `[file:hashes.'SHA-1' = '${value}']`;
      case 'hash_sha256': return `[file:hashes.'SHA-256' = '${value}']`;
      case 'email': return `[email-addr:value = '${value}']`;
      case 'cve': return `[vulnerability:name = '${value}']`;
      default: return `[artifact:payload_bin = '${value}']`;
    }
  }
}
