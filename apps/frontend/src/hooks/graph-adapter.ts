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

function toEntityType(nodeType: string): GraphNode['entityType'] {
  return ENTITY_TYPE_MAP[nodeType] ?? (nodeType.toLowerCase() as GraphNode['entityType'])
}

function toLabel(id: string, properties: Record<string, unknown>): string {
  const name = properties?.name
  if (typeof name === 'string' && name) return name
  const value = properties?.value
  if (typeof value === 'string' && value) return value
  const cveId = properties?.cveId
  if (typeof cveId === 'string' && cveId) return cveId
  return id
}

export function toGraphSubgraph(raw: GraphApiSubgraph): GraphSubgraph {
  const nodes: GraphNode[] = (raw?.nodes ?? []).map(n => ({
    id: n.id,
    entityType: toEntityType(n.nodeType),
    label: toLabel(n.id, n.properties ?? {}),
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
