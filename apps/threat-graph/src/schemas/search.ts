import { z } from 'zod';
import type { NodeType, RelationshipType, GraphNodeResponse, GraphEdgeResponse } from './graph.js';

// ─── #6 Bidirectional Relationship Query ─────────────────────────

export const NodeRelationshipsQuerySchema = z.object({
  type: z.string().optional(),
  direction: z.enum(['inbound', 'outbound', 'both']).default('both'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type NodeRelationshipsQuery = z.infer<typeof NodeRelationshipsQuerySchema>;

export interface DirectionalEdge {
  id: string;
  type: RelationshipType;
  fromNodeId: string;
  toNodeId: string;
  confidence: number;
  direction: 'inbound' | 'outbound';
  source: 'auto-detected' | 'analyst-confirmed';
  properties: Record<string, unknown>;
}

export interface NodeRelationshipsResponse {
  nodeId: string;
  relationships: DirectionalEdge[];
  inboundCount: number;
  outboundCount: number;
}

// ─── #7 Cluster Detection ────────────────────────────────────────

export const ClusterDetectionQuerySchema = z.object({
  minSize: z.coerce.number().int().min(2).max(100).default(3),
  nodeType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ClusterDetectionQuery = z.infer<typeof ClusterDetectionQuerySchema>;

export interface ClusterNode {
  id: string;
  nodeType: NodeType;
  label: string;
  riskScore: number;
}

export interface DetectedCluster {
  id: string;
  nodes: ClusterNode[];
  sharedEntities: Array<{ id: string; type: NodeType; label: string }>;
  avgRiskScore: number;
  maxRiskScore: number;
  size: number;
}

export interface ClusterDetectionResponse {
  clusters: DetectedCluster[];
  totalClusters: number;
}

// ─── #8 Impact Radius ────────────────────────────────────────────

export const ImpactQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(5).default(3),
});

export type ImpactQuery = z.infer<typeof ImpactQuerySchema>;

export interface ImpactedNode {
  id: string;
  nodeType: NodeType;
  label: string;
  currentScore: number;
  projectedScore: number;
  scoreDelta: number;
  distance: number;
}

export interface ImpactRadiusResponse {
  triggerNodeId: string;
  triggerScore: number;
  depth: number;
  affectedNodes: ImpactedNode[];
  totalAffected: number;
  maxScoreIncrease: number;
  blastRadius: number;
}

// ─── #10 Graph Diff / Timeline ───────────────────────────────────

export const TimelineQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type TimelineQuery = z.infer<typeof TimelineQuerySchema>;

export interface GraphDiffResponse {
  nodeId: string;
  period: { from: string; to: string };
  added: { nodes: GraphNodeResponse[]; edges: GraphEdgeResponse[] };
  stale: { nodes: GraphNodeResponse[]; edges: GraphEdgeResponse[] };
  summary: { nodesAdded: number; nodesStale: number; edgesAdded: number; edgesStale: number };
}

// ─── #11 Expand Node ─────────────────────────────────────────────

export const ExpandQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  nodeType: z.string().optional(),
});

export type ExpandQuery = z.infer<typeof ExpandQuerySchema>;

export interface ExpandedNeighbor {
  node: GraphNodeResponse;
  relationship: { type: RelationshipType; confidence: number; direction: 'inbound' | 'outbound' };
}

export interface ExpandNodeResponse {
  nodeId: string;
  neighbors: ExpandedNeighbor[];
  total: number;
  hasMore: boolean;
}

// ─── #12 STIX 2.1 Export ─────────────────────────────────────────

export const StixExportInputSchema = z.object({
  nodeId: z.string().uuid().optional(),
  nodeIds: z.array(z.string().uuid()).optional(),
  depth: z.coerce.number().int().min(1).max(5).default(2),
}).refine(
  (data) => data.nodeId || (data.nodeIds && data.nodeIds.length > 0),
  { message: 'Either nodeId or nodeIds must be provided' },
);

export type StixExportInput = z.infer<typeof StixExportInputSchema>;

export interface StixObject {
  type: string;
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  spec_version: '2.1';
  objects: StixObject[];
}

// ─── #13 Graph Search ────────────────────────────────────────────

export const GraphSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  nodeType: z.string().optional(),
  minRisk: z.coerce.number().min(0).max(100).optional(),
  maxRisk: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GraphSearchQuery = z.infer<typeof GraphSearchQuerySchema>;

export interface GraphSearchResponse {
  results: GraphNodeResponse[];
  total: number;
  page: number;
  limit: number;
}

// ─── #14 Relationship CRUD ───────────────────────────────────────

export const RelationshipParamsSchema = z.object({
  fromId: z.string().uuid(),
  type: z.string(),
  toId: z.string().uuid(),
});

export const UpdateRelationshipSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['auto-detected', 'analyst-confirmed']).optional(),
  properties: z.record(z.unknown()).optional(),
});

export type UpdateRelationshipInput = z.infer<typeof UpdateRelationshipSchema>;

// ─── #15 Propagation Audit Trail ─────────────────────────────────

export const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  nodeId: z.string().uuid().optional(),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export interface PropagationAuditEntry {
  id: string;
  timestamp: string;
  tenantId: string;
  triggerNodeId: string;
  triggerScore: number;
  maxDepth: number;
  nodesUpdated: number;
  nodesVisited: number;
  updates: Array<{
    nodeId: string;
    oldScore: number;
    newScore: number;
    distance: number;
    relType: string;
    decayWeight: number;
    confidenceWeight: number;
    temporalWeight: number;
    relTypeWeight: number;
  }>;
}

export interface AuditTrailResponse {
  entries: PropagationAuditEntry[];
  total: number;
}
