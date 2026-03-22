import { z } from 'zod';

// ─── Node Type Enum ──────────────────────────────────────────────

export const NODE_TYPES = [
  'IOC', 'ThreatActor', 'Malware', 'Campaign',
  'Infrastructure', 'Vulnerability', 'Victim',
] as const;

export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

// ─── Relationship Type Enum ──────────────────────────────────────

export const RELATIONSHIP_TYPES = [
  'USES', 'CONDUCTS', 'TARGETS', 'CONTROLS', 'RESOLVES_TO',
  'HOSTED_ON', 'EXPLOITS', 'INDICATES', 'OBSERVED_IN',
] as const;

export const RelationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

/**
 * Per-relationship-type propagation weight (P1 #9).
 * Higher weight = stronger risk transfer through this relationship.
 */
export const RELATIONSHIP_TYPE_WEIGHTS: Record<RelationshipType, number> = {
  CONTROLS:    0.95,  // Malware → IOC: very strong signal
  USES:        0.90,  // Actor → Malware: strong signal
  CONDUCTS:    0.85,  // Actor → Campaign: strong signal
  EXPLOITS:    0.85,  // Actor → Vulnerability: strong signal
  INDICATES:   0.80,  // IOC → Actor: attribution signal
  TARGETS:     0.75,  // Campaign → Victim: moderate
  HOSTED_ON:   0.70,  // IOC → Infrastructure: co-location
  RESOLVES_TO: 0.65,  // IOC → IOC: DNS resolution
  OBSERVED_IN: 0.60,  // IOC → Campaign: weakest direct signal
};

/** Valid source→target combinations for relationship types. */
export const RELATIONSHIP_RULES: Record<RelationshipType, { from: NodeType[]; to: NodeType[] }> = {
  USES:        { from: ['ThreatActor'],  to: ['Malware'] },
  CONDUCTS:    { from: ['ThreatActor'],  to: ['Campaign'] },
  TARGETS:     { from: ['Campaign'],     to: ['Victim'] },
  CONTROLS:    { from: ['Malware'],      to: ['IOC'] },
  RESOLVES_TO: { from: ['IOC'],          to: ['IOC'] },
  HOSTED_ON:   { from: ['IOC'],          to: ['Infrastructure'] },
  EXPLOITS:    { from: ['ThreatActor'],  to: ['Vulnerability'] },
  INDICATES:   { from: ['IOC'],          to: ['ThreatActor'] },
  OBSERVED_IN: { from: ['IOC'],          to: ['Campaign'] },
};

// ─── Node Properties ─────────────────────────────────────────────

const BaseNodeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  nodeType: NodeTypeSchema,
  riskScore: z.number().min(0).max(100).default(0),
  confidence: z.number().min(0).max(1).default(0),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const IOCNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('IOC'),
  iocType: z.enum(['ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email', 'cidr', 'asn', 'cve']),
  value: z.string().min(1).max(2048),
});

export const ThreatActorNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('ThreatActor'),
  name: z.string().min(1).max(500),
  aliases: z.array(z.string()).optional(),
  motivation: z.string().optional(),
});

export const MalwareNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('Malware'),
  name: z.string().min(1).max(500),
  family: z.string().optional(),
  malwareType: z.string().optional(),
});

export const CampaignNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('Campaign'),
  name: z.string().min(1).max(500),
  status: z.enum(['active', 'inactive', 'suspected']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const InfrastructureNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('Infrastructure'),
  infraType: z.enum(['hosting', 'vpn', 'proxy', 'cdn', 'dns', 'c2', 'other']),
  value: z.string().min(1).max(2048),
  asn: z.string().optional(),
  provider: z.string().optional(),
});

export const VulnerabilityNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('Vulnerability'),
  cveId: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
  cvss: z.number().min(0).max(10).optional(),
  epss: z.number().min(0).max(1).optional(),
});

export const VictimNodeSchema = BaseNodeSchema.extend({
  nodeType: z.literal('Victim'),
  name: z.string().min(1).max(500),
  industry: z.string().optional(),
  country: z.string().max(2).optional(),
});

/** Union schema for all node types. */
export const GraphNodeSchema = z.discriminatedUnion('nodeType', [
  IOCNodeSchema,
  ThreatActorNodeSchema,
  MalwareNodeSchema,
  CampaignNodeSchema,
  InfrastructureNodeSchema,
  VulnerabilityNodeSchema,
  VictimNodeSchema,
]);

export type GraphNode = z.infer<typeof GraphNodeSchema>;

// ─── Create Node Input (id + tenantId optional — server generates) ──

export const CreateNodeInputSchema = z.object({
  nodeType: NodeTypeSchema,
  properties: z.record(z.unknown()),
}).refine(
  (data) => {
    if (data.nodeType === 'IOC') return data.properties['value'] !== undefined;
    if (data.nodeType === 'ThreatActor') return data.properties['name'] !== undefined;
    if (data.nodeType === 'Malware') return data.properties['name'] !== undefined;
    if (data.nodeType === 'Campaign') return data.properties['name'] !== undefined;
    if (data.nodeType === 'Infrastructure') return data.properties['value'] !== undefined;
    if (data.nodeType === 'Vulnerability') return data.properties['cveId'] !== undefined;
    if (data.nodeType === 'Victim') return data.properties['name'] !== undefined;
    return false;
  },
  { message: 'Missing required property for node type' },
);

export type CreateNodeInput = z.infer<typeof CreateNodeInputSchema>;

// ─── Relationship Schemas ────────────────────────────────────────

export const CreateRelationshipSchema = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  type: RelationshipTypeSchema,
  confidence: z.number().min(0).max(1).default(0.5),
  source: z.enum(['auto-detected', 'analyst-confirmed']).default('auto-detected'),
  properties: z.record(z.unknown()).optional(),
});

export type CreateRelationshipInput = z.infer<typeof CreateRelationshipSchema>;

export const RelationshipSchema = CreateRelationshipSchema.extend({
  id: z.string(),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
});

export type GraphRelationship = z.infer<typeof RelationshipSchema>;

// ─── Query Parameter Schemas ─────────────────────────────────────

export const NHopQuerySchema = z.object({
  hops: z.coerce.number().int().min(1).max(5).default(2),
  nodeTypes: z.string().optional(), // comma-separated filter
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const PathQuerySchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  maxDepth: z.coerce.number().int().min(1).max(10).default(5),
});

export const ClusterQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(5).default(2),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const PropagateInputSchema = z.object({
  nodeId: z.string().uuid(),
  maxDepth: z.coerce.number().int().min(1).max(5).default(3),
});

export const StatsQuerySchema = z.object({
  tenantId: z.string().uuid().optional(), // from auth context
});

// ─── Response Schemas ────────────────────────────────────────────

export interface GraphNodeResponse {
  id: string;
  nodeType: NodeType;
  properties: Record<string, unknown>;
  riskScore: number;
  confidence: number;
}

export interface GraphEdgeResponse {
  id: string;
  type: RelationshipType;
  fromNodeId: string;
  toNodeId: string;
  confidence: number;
  properties: Record<string, unknown>;
}

export interface GraphSubgraphResponse {
  nodes: GraphNodeResponse[];
  edges: GraphEdgeResponse[];
}

export interface PathExplanationStep {
  fromNode: { id: string; type: NodeType; label: string };
  relationship: RelationshipType;
  toNode: { id: string; type: NodeType; label: string };
}

export interface PathResponse {
  path: GraphSubgraphResponse;
  length: number;
  explanation: string;
  steps: PathExplanationStep[];
}

export interface PropagationResult {
  triggerNodeId: string;
  nodesUpdated: number;
  nodesVisited: number;
  maxDepthReached: number;
  updates: Array<{ nodeId: string; oldScore: number; newScore: number; distance: number }>;
}

export interface GraphStatsResponse {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  mostConnected: Array<{ id: string; type: NodeType; label: string; connections: number }>;
  isolatedNodes: number;
  avgConnections: number;
}
