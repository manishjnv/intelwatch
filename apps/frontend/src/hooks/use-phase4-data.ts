/**
 * @module hooks/use-phase4-data
 * @description TanStack Query hooks for Phase 4 services:
 * DRP (:3011), Threat Graph (:3012), Correlation Engine (:3013), Hunting (:3014).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import {
  type DRPAlert, type DRPAlertStats, type DRPAsset, type DRPAssetStats,
  type CertStreamStatus, type TyposquatCandidate,
  type GraphNode, type GraphEdge, type GraphStats, type GraphSubgraph,
  type CorrelationResult, type CorrelationStats, type CampaignCluster,
  type HuntSession, type HuntStats, type HuntHypothesis,
  type HuntEvidence, type HuntTemplate,
} from './phase4-demo-data'
import { toGraphSubgraph, type GraphApiSubgraph } from './graph-adapter'

// Re-export types for page consumption
export type {
  DRPAlert, DRPAlertStats, DRPAsset, DRPAssetStats,
  CertStreamStatus, TyposquatCandidate,
  GraphNode, GraphEdge, GraphStats, GraphSubgraph,
  CorrelationResult, CorrelationStats, CampaignCluster,
  HuntSession, HuntStats, HuntHypothesis, HuntEvidence, HuntTemplate,
}

// ─── Generic helpers ────────────────────────────────────────────

interface QueryParams {
  page?: number; limit?: number; [key: string]: string | number | boolean | undefined
}

function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ─── DRP Hooks ──────────────────────────────────────────────────
// apps/drp-service response shapes differ from the DRPAsset/DRPAlert/*Stats types
// above (modelled on the old demo data) — these adapters translate real → page shape.

interface DRPAssetApi {
  id: string; type: string; value: string; displayName: string
  enabled: boolean; lastScannedAt: string | null; alertCount: number
  criticality: number; createdAt: string
}
function toDRPAsset(a: DRPAssetApi): DRPAsset {
  return {
    id: a.id, name: a.displayName, type: a.type as DRPAsset['type'],
    value: a.value, status: a.enabled ? 'active' : 'paused',
    lastScanAt: a.lastScannedAt, alertCount: a.alertCount,
    // ponytail: GET /assets has no computed risk score (that's GET /assets/:id/risk,
    // one call per asset); criticality (0-1 config value) stands in until that's wired.
    riskScore: Math.round((a.criticality ?? 0) * 100),
    createdAt: a.createdAt,
  }
}

interface DRPAssetStatsApi {
  total: number; byType: Record<string, number>; enabled: number; disabled: number; totalAlerts: number
}
function toDRPAssetStats(s: DRPAssetStatsApi): DRPAssetStats {
  // ponytail: no avg-risk field on this endpoint; 0 until server aggregates it
  return { total: s.total, byType: s.byType, avgRiskScore: 0 }
}

interface DRPAlertApi {
  id: string; assetId: string; type: string; severity: string; status: string
  title: string; description: string; confidence: number
  assignedTo: string | null; detectedValue: string
  resolvedAt: string | null; createdAt: string
}
function toDRPAlert(a: DRPAlertApi): DRPAlert {
  return {
    id: a.id, assetId: a.assetId, type: a.type as DRPAlert['type'],
    title: a.title, description: a.description,
    severity: a.severity as DRPAlert['severity'], status: a.status as DRPAlert['status'],
    detectedValue: a.detectedValue, confidence: a.confidence, assignee: a.assignedTo,
    createdAt: a.createdAt, resolvedAt: a.resolvedAt,
    // ponytail: backend has no separate "triaged at" timestamp; SLA badge falls back to open/resolved
    triagedAt: null,
  }
}

interface DRPAlertStatsApi {
  total: number; byType: Record<string, number>; byStatus: Record<string, number>
  bySeverity: Record<string, number>; avgConfidence: number; resolutionRate: number
}
function toDRPAlertStats(s: DRPAlertStatsApi): DRPAlertStats {
  return {
    total: s.total, byType: s.byType, bySeverity: s.bySeverity,
    open: s.byStatus?.['open'] ?? 0,
    investigating: s.byStatus?.['investigating'] ?? 0,
    resolved: s.byStatus?.['resolved'] ?? 0,
  }
}

interface CertStreamStatsApi {
  enabled: boolean; connected: boolean; certificatesProcessed: number
  matchesThisHour: number; uptime: number
}
function toCertStreamStatus(s: CertStreamStatsApi): CertStreamStatus {
  const hrs = Math.floor(s.uptime / 3_600_000)
  const mins = Math.floor((s.uptime % 3_600_000) / 60_000)
  return {
    enabled: s.enabled, connected: s.connected,
    matchesLastHour: s.matchesThisHour, totalProcessed: s.certificatesProcessed,
    uptime: s.enabled ? `${hrs}h ${mins}m` : '—',
  }
}

export function useDRPAssets(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  return useQuery({
    queryKey: ['drp-assets', params],
    queryFn: async () => {
      const r = await apiList<DRPAssetApi>(`/drp/assets${query}`)
      return { ...r, data: r.data.map(toDRPAsset) }
    },
    meta: { resource: 'monitored assets' },
    staleTime: 60_000,
  })
}

export function useDRPAssetStats() {
  return useQuery({
    queryKey: ['drp-asset-stats'],
    queryFn: () => api<DRPAssetStatsApi>('/drp/assets/stats').then(toDRPAssetStats),
    meta: { resource: 'asset stats' },
    staleTime: 60_000,
  })
}

export function useDRPAlerts(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  return useQuery({
    queryKey: ['drp-alerts', params],
    queryFn: async () => {
      const r = await apiList<DRPAlertApi>(`/drp/alerts${query}`)
      return { ...r, data: r.data.map(toDRPAlert) }
    },
    meta: { resource: 'DRP alerts' },
    staleTime: 30_000,
  })
}

export function useDRPAlertStats() {
  return useQuery({
    queryKey: ['drp-alert-stats'],
    queryFn: () => api<DRPAlertStatsApi>('/drp/alerts/stats').then(toDRPAlertStats),
    meta: { resource: 'alert stats' },
    staleTime: 30_000,
  })
}

export function useCertStreamStatus() {
  return useQuery({
    queryKey: ['certstream-status'],
    queryFn: () => api<CertStreamStatsApi>('/drp/certstream/status').then(toCertStreamStatus),
    meta: { resource: 'CertStream status' },
    staleTime: 15_000,
  })
}

/** POST /drp/detect/typosquat response shape (backend field is `topCandidates`, not `candidates`). */
export interface TyposquatScanResult {
  scanId: string
  domain: string
  candidatesFound: number
  registeredCount: number
  alertsCreated: number
  topCandidates: TyposquatCandidate[]
  durationMs: number
}

export function useTyposquatScan() {
  const queryClient = useQueryClient()
  return useMutation({
    // Backend sends { data: {...} } single-wrapped; api() already unwraps it.
    mutationFn: (domain: string) =>
      api<TyposquatScanResult>(
        '/drp/detect/typosquat', { method: 'POST', body: { domain } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

export function useCreateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { type: string; value: string; displayName: string; criticality?: number; scanFrequencyHours?: number; tags?: string[] }) =>
      api<DRPAsset>('/drp/assets', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-assets'] })
      queryClient.invalidateQueries({ queryKey: ['drp-asset-stats'] })
    },
  })
}

export function useDeleteAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/drp/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-assets'] })
      queryClient.invalidateQueries({ queryKey: ['drp-asset-stats'] })
    },
  })
}

export function useScanAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ assetId: string; status: string }>(`/drp/assets/${id}/scan`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-assets'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

export function useChangeAlertStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      api<DRPAlert>(`/drp/alerts/${id}/status`, { method: 'PATCH', body: { status, notes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

export function useAssignAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      api<DRPAlert>(`/drp/alerts/${id}/assign`, { method: 'PATCH', body: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
    },
  })
}

export function useAlertFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, verdict, reason }: { id: string; verdict: 'true_positive' | 'false_positive'; reason?: string }) =>
      api<unknown>(`/drp/alerts/${id}/feedback`, { method: 'POST', body: { verdict, reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

export function useTriageAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, verdict, notes }: { id: string; verdict: 'true_positive' | 'false_positive' | 'investigate'; notes?: string }) =>
      api<{ id: string; verdict: string; status: string }>(`/drp/alerts/${id}/triage`, { method: 'POST', body: { verdict, notes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

export function useRequestTakedown() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, provider, evidence, urgency }: { id: string; provider: string; evidence: string; urgency: string }) =>
      api<{ takedownId: string; alertId: string; status: string }>(`/drp/alerts/${id}/takedown`, { method: 'POST', body: { provider, evidence, urgency } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

export function useBulkTriageAlerts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, verdict, notes }: { ids: string[]; verdict: string; notes?: string }) =>
      api<{ processed: number }>('/drp/alerts/bulk-triage', { method: 'POST', body: { ids, verdict, notes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

// ─── Threat Graph Hooks ─────────────────────────────────────────

export function useGraphNodes(limit = 50) {
  return useQuery({
    queryKey: ['graph-overview', limit],
    queryFn: () => api<GraphApiSubgraph>(`/graph/overview?limit=${limit}`).then(toGraphSubgraph),
    staleTime: 60_000,
  })
}

export function useGraphStats() {
  return useQuery({
    queryKey: ['graph-stats'],
    queryFn: () => api<GraphStats>('/graph/stats'),
    staleTime: 60_000,
  })
}

export function useGraphSearch(query: string) {
  return useQuery({
    queryKey: ['graph-search', query],
    queryFn: () => api<{ nodes: GraphNode[] }>(`/graph/search?q=${encodeURIComponent(query)}&limit=20`).catch(() => ({ nodes: [] })),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}

export function useNodeNeighbors(nodeId: string | null) {
  return useQuery({
    queryKey: ['graph-neighbors', nodeId],
    // A 404 here legitimately means "this entity isn't in the graph yet" — keep the fallback.
    queryFn: () => api<GraphApiSubgraph>(`/graph/entity/${nodeId}?hops=1&limit=20`)
      .then(toGraphSubgraph)
      .catch(() => ({ nodes: [], edges: [] })),
    enabled: !!nodeId,
    staleTime: 60_000,
  })
}

// ─── Correlation Hooks ──────────────────────────────────────────

export function useCorrelations(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  return useQuery({
    queryKey: ['correlations', params],
    queryFn: () => apiList<CorrelationResult>(`/correlations${query}`),
    meta: { resource: 'correlations' },
    staleTime: 30_000,
  })
}

export function useCorrelationStats() {
  return useQuery({
    queryKey: ['correlation-stats'],
    queryFn: () => api<CorrelationStats>('/correlations/stats'),
    meta: { resource: 'correlation stats' },
    staleTime: 30_000,
  })
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiList<CampaignCluster>('/correlations/campaigns'),
    meta: { resource: 'campaigns' },
    staleTime: 60_000,
  })
}

export function useTriggerCorrelation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ correlationsFound: number; campaignsDetected: number; wavesDetected: number; suppressed: number }>(
      '/correlations/run', { method: 'POST' },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlations'] })
      queryClient.invalidateQueries({ queryKey: ['correlation-stats'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

export function useCorrelationFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, verdict, reason }: { id: string; verdict: 'true_positive' | 'false_positive'; reason?: string }) =>
      api<unknown>(`/correlations/${id}/feedback`, { method: 'POST', body: { verdict, reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlations'] })
      queryClient.invalidateQueries({ queryKey: ['correlation-stats'] })
    },
  })
}

export function useBulkCorrelationFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, verdict }: { ids: string[]; verdict: 'true_positive' | 'false_positive' }) => {
      const results = await Promise.allSettled(
        ids.map(id => api<unknown>(`/correlations/${id}/feedback`, { method: 'POST', body: { verdict } }))
      )
      return { processed: results.filter(r => r.status === 'fulfilled').length }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlations'] })
      queryClient.invalidateQueries({ queryKey: ['correlation-stats'] })
    },
  })
}

// ─── Hunting Hooks ──────────────────────────────────────────────

export function useHuntSessions(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  return useQuery({
    queryKey: ['hunt-sessions', params],
    queryFn: () => apiList<HuntSession>(`/hunts${query}`),
    meta: { resource: 'hunt sessions' },
    staleTime: 30_000,
  })
}

export function useHuntStats() {
  return useQuery({
    queryKey: ['hunt-stats'],
    queryFn: () => api<HuntStats>('/hunts/stats'),
    meta: { resource: 'hunt stats' },
    staleTime: 30_000,
  })
}

export function useHuntHypotheses(huntId: string | null) {
  return useQuery({
    queryKey: ['hunt-hypotheses', huntId],
    queryFn: () => apiList<HuntHypothesis>(`/hunts/${huntId}/hypotheses`),
    meta: { resource: 'hunt hypotheses' },
    enabled: !!huntId,
    staleTime: 30_000,
  })
}

export function useHuntEvidence(huntId: string | null) {
  return useQuery({
    queryKey: ['hunt-evidence', huntId],
    queryFn: () => apiList<HuntEvidence>(`/hunts/${huntId}/evidence`),
    meta: { resource: 'hunt evidence' },
    enabled: !!huntId,
    staleTime: 30_000,
  })
}

export function useHuntTemplates() {
  return useQuery({
    queryKey: ['hunt-templates'],
    // Backend sends { data: HuntTemplate[], total } single-wrapped; apiList() normalizes it
    // (api() alone would drop total — RCA #45).
    queryFn: () => apiList<HuntTemplate>('/hunts/templates'),
    meta: { resource: 'hunt templates' },
    staleTime: 5 * 60_000,
  })
}

export function useCreateHunt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description: string; huntType: string; templateId?: string }) =>
      api<HuntSession>('/hunts', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hunt-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['hunt-stats'] })
    },
  })
}

export function useChangeHuntStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ huntId, status }: { huntId: string; status: string }) =>
      api<HuntSession>(`/hunts/${huntId}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hunt-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['hunt-stats'] })
    },
  })
}

export function useAddHypothesis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ huntId, statement, rationale, mitreTechniques }: {
      huntId: string; statement: string; rationale: string; mitreTechniques?: string[]
    }) => api<HuntHypothesis>(`/hunts/${huntId}/hypotheses`, {
      method: 'POST', body: { statement, rationale, mitreTechniques: mitreTechniques ?? [] },
    }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['hunt-hypotheses', vars.huntId] })
    },
  })
}

export function useAddEvidence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ huntId, type, title, description, entityType, entityValue, tags }: {
      huntId: string; type: string; title: string; description: string
      entityType?: string; entityValue?: string; tags?: string[]
    }) => api<HuntEvidence>(`/hunts/${huntId}/evidence`, {
      method: 'POST', body: { type, title, description, entityType, entityValue, tags: tags ?? [] },
    }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['hunt-evidence', vars.huntId] })
    },
  })
}

// ─── Integration + Hunt Action Hooks ────────────────────────────

export function useCreateTicket() {
  return useMutation({
    mutationFn: (input: { correlationId: string; tenantId: string; title: string; description: string }) =>
      api<{ ticketId: string; status: string; url?: string }>(
        '/integrations/tickets', { method: 'POST', body: input },
      ),
  })
}

export function useAddToHunt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ huntId, entityType, entityId }: { huntId: string; entityType: string; entityId: string }) =>
      api<{ id: string; huntId: string }>(`/hunts/${huntId}/entities`, {
        method: 'POST', body: { entityType, entityId },
      }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['hunt-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['hunt-evidence', vars.huntId] })
    },
  })
}

// ─── Graph Mutation Hooks ───────────────────────────────────────

export function useGraphPath(fromId: string | null, toId: string | null) {
  return useQuery({
    queryKey: ['graph-path', fromId, toId],
    queryFn: () => api<{ nodes: GraphNode[]; edges: GraphEdge[]; hops: number }>(
      `/graph/path?from=${fromId}&to=${toId}&maxDepth=6`,
    ).catch(() => ({ nodes: [], edges: [], hops: 0 })),
    enabled: !!fromId && !!toId && fromId !== toId,
    staleTime: 30_000,
  })
}

export function useCreateGraphNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { entityType: string; label: string; riskScore?: number; properties?: Record<string, unknown> }) =>
      api<GraphNode>('/graph/nodes', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph-nodes'] })
      queryClient.invalidateQueries({ queryKey: ['graph-stats'] })
    },
  })
}

export function useStixExport() {
  return useMutation({
    mutationFn: (input: { nodeId?: string; nodeIds?: string[]; depth?: number }) =>
      api<unknown>('/graph/export/stix', { method: 'POST', body: input }),
  })
}
