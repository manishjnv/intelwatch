/**
 * @module hooks/graph-adapter
 * @description Maps raw threat-graph backend responses (apps/threat-graph/src/schemas/graph.ts)
 * to the frontend GraphNode/GraphEdge shapes used across the Threat Graph page and IOC detail panel.
 */
import type { GraphNode, GraphEdge, GraphSubgraph } from './phase4-demo-data'

export interface GraphApiNode {
  id: string
  nodeType: 'IOC' | 'ThreatActor' | 'Malware' | 'Campaign' | 'Infrastructure' | 'Vulnerability' | 'Victim'
  riskScore: number
  confidence: number
  properties: Record<string, unknown>
}

export interface GraphApiEdge {
  id: string
  type: string
  fromNodeId: string
  toNodeId: string
  confidence: number
  properties: Record<string, unknown>
}

export interface GraphApiSubgraph {
  nodes: GraphApiNode[]
  edges: GraphApiEdge[]
}

const ENTITY_TYPE_MAP: Record<string, GraphNode['entityType']> = {
  IOC: 'ioc',
  ThreatActor: 'threat_actor',
  Malware: 'malware',
  Vulnerability: 'vulnerability',
  Campaign: 'campaign',
  Infrastructure: 'infrastructure',
  Victim: 'victim',
}

// Graph-sync currently labels IOC nodes by their IOC type (cve, domain, url, hash_*, ...).
function toEntityType(nodeType: string): GraphNode['entityType'] {
  const mapped = ENTITY_TYPE_MAP[nodeType]
  if (mapped) return mapped
  return nodeType.toLowerCase() === 'cve' ? 'vulnerability' : 'ioc'
}

function toLabel(id: string, nodeType: string, properties: Record<string, unknown>): string {
  for (const key of ['name', 'value', 'cveId'] as const) {
    const v = properties?.[key]
    if (typeof v === 'string' && v) return v
  }
  return `${nodeType.toLowerCase()}:${id.slice(0, 8)}`
}

export function toGraphSubgraph(raw: GraphApiSubgraph): GraphSubgraph {
  const nodes: GraphNode[] = (raw?.nodes ?? []).map(n => ({
    id: n.id,
    entityType: toEntityType(n.nodeType),
    label: toLabel(n.id, String(n.nodeType ?? ''), n.properties ?? {}),
    riskScore: Number(n.riskScore ?? 0),
    properties: n.properties ?? {},
    createdAt: String((n.properties ?? {}).firstSeen ?? ''),
  }))
  const edges: GraphEdge[] = (raw?.edges ?? []).map(e => ({
    id: e.id,
    sourceId: e.fromNodeId,
    targetId: e.toNodeId,
    relationshipType: (e.type ?? '').toLowerCase(),
    confidence: e.confidence,
    properties: e.properties ?? {},
  }))
  return { nodes, edges }
}
