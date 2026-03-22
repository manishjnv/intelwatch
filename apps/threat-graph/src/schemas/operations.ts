import { z } from 'zod';
import { NodeTypeSchema, RelationshipTypeSchema } from './graph.js';
import type { RelationshipType } from './graph.js';

// ─── #16 Node Merge/Split ────────────────────────────────────────

export const MergeNodesInputSchema = z.object({
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  preferTarget: z.boolean().default(true),
  triggerPropagation: z.boolean().default(true),
});

export type MergeNodesInput = z.infer<typeof MergeNodesInputSchema>;

export interface MergeResult {
  mergedNodeId: string;
  deletedNodeId: string;
  relationshipsTransferred: number;
  propertiesMerged: string[];
  propagationTriggered: boolean;
}

export const SplitNodeInputSchema = z.object({
  sourceNodeId: z.string().uuid(),
  newNodeProperties: z.record(z.unknown()),
  relationshipsToMove: z.array(z.object({
    fromNodeId: z.string().uuid(),
    type: RelationshipTypeSchema,
    toNodeId: z.string().uuid(),
  })),
});

export type SplitNodeInput = z.infer<typeof SplitNodeInputSchema>;

export interface SplitResult {
  originalNodeId: string;
  newNodeId: string;
  relationshipsMoved: number;
}

// ─── #17 Batch Import ────────────────────────────────────────────

export const BatchNodeSchema = z.object({
  nodeType: NodeTypeSchema,
  properties: z.record(z.unknown()),
});

export const BatchRelationshipSchema = z.object({
  fromNodeId: z.string(),
  toNodeId: z.string(),
  type: RelationshipTypeSchema,
  confidence: z.number().min(0).max(1).default(0.5),
  source: z.enum(['auto-detected', 'analyst-confirmed']).default('auto-detected'),
});

export const BatchImportInputSchema = z.object({
  nodes: z.array(BatchNodeSchema).max(500),
  relationships: z.array(BatchRelationshipSchema).max(1000).default([]),
});

export type BatchImportInput = z.infer<typeof BatchImportInputSchema>;

export interface BatchImportResult {
  nodesCreated: number;
  nodesUpdated: number;
  nodesFailed: number;
  relationshipsCreated: number;
  relationshipsFailed: number;
  nodeIds: string[];
  errors: Array<{ index: number; type: 'node' | 'relationship'; error: string }>;
}

// ─── #18 Decay Cron ──────────────────────────────────────────────

export interface DecayStatus {
  running: boolean;
  intervalMs: number;
  lastRun: string | null;
  lastResult: DecayRunResult | null;
}

export interface DecayRunResult {
  timestamp: string;
  nodesEvaluated: number;
  nodesDecayed: number;
  avgDecayAmount: number;
  duration: number;
}

// ─── #19 Layout Presets ──────────────────────────────────────────

export const LayoutConfigSchema = z.object({
  centerNodeId: z.string().uuid().optional(),
  depth: z.number().int().min(1).max(5).default(2),
  nodePositions: z.record(z.object({
    x: z.number(),
    y: z.number(),
  })).default({}),
  nodeTypeVisibility: z.record(z.boolean()).default({}),
  edgeTypeVisibility: z.record(z.boolean()).default({}),
  filters: z.object({
    minRisk: z.number().min(0).max(100).optional(),
    maxRisk: z.number().min(0).max(100).optional(),
    nodeTypes: z.array(z.string()).optional(),
  }).default({}),
  zoom: z.number().min(0.1).max(10).default(1),
  panX: z.number().default(0),
  panY: z.number().default(0),
});

export const CreateLayoutInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  config: LayoutConfigSchema,
});

export type CreateLayoutInput = z.infer<typeof CreateLayoutInputSchema>;

export interface LayoutPreset {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  config: z.infer<typeof LayoutConfigSchema>;
}

export interface LayoutListResponse {
  presets: LayoutPreset[];
  total: number;
}

// ─── #20 Relationship Trending ───────────────────────────────────

export interface ConfidenceChange {
  timestamp: string;
  oldConfidence: number;
  newConfidence: number;
  delta: number;
  source: 'auto-detected' | 'analyst-confirmed';
  updatedBy: string;
}

export interface TrendingResponse {
  relationshipId: string;
  fromNodeId: string;
  type: RelationshipType;
  toNodeId: string;
  currentConfidence: number;
  changes: ConfidenceChange[];
  trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  avgConfidence: number;
}
