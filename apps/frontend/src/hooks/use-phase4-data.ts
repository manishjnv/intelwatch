/**
 * @module hooks/use-phase4-data
 * @description TanStack Query hooks for Phase 4 services:
 * DRP (:3011), Threat Graph (:3012), Correlation Engine (:3013), Hunting (:3014).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import { notifyApiError } from './useApiError'
import {
  DEMO_DRP_ALERTS, DEMO_DRP_ALERT_STATS, DEMO_DRP_ASSETS, DEMO_DRP_ASSET_STATS,
  DEMO_CERTSTREAM_STATUS,
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

interface ListResponse<T> {
  data: T[]; total: number; page: number; limit: number
}

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

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── DRP Hooks ──────────────────────────────────────────────────

export function useDRPAssets(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty: ListResponse<DRPAsset> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['drp-assets', params],
    queryFn: () => apiList<DRPAsset>(`/drp/assets${query}`).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_DRP_ASSETS, total: DEMO_DRP_ASSETS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useDRPAssetStats() {
  const empty: DRPAssetStats = { total: 0, byType: {}, avgRiskScore: 0 }
  const result = useQuery({
    queryKey: ['drp-asset-stats'],
    queryFn: () => api<DRPAssetStats>('/drp/assets/stats').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_DRP_ASSET_STATS, d => (d?.total ?? 0) > 0)
}

export function useDRPAlerts(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty: ListResponse<DRPAlert> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['drp-alerts', params],
    queryFn: () => apiList<DRPAlert>(`/drp/alerts${query}`).catch(err => notifyApiError(err, 'DRP alerts', empty)),
    staleTime: 30_000,
  })
  return withDemoFallback(result,
    { data: DEMO_DRP_ALERTS, total: DEMO_DRP_ALERTS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useDRPAlertStats() {
  const empty: DRPAlertStats = { total: 0, open: 0, investigating: 0, resolved: 0, bySeverity: {}, byType: {} }
  const result = useQuery({
    queryKey: ['drp-alert-stats'],
    queryFn: () => api<DRPAlertStats>('/drp/alerts/stats').catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_DRP_ALERT_STATS, d => (d?.total ?? 0) > 0)
}

export function useCertStreamStatus() {
  const empty: CertStreamStatus = { enabled: false, connected: false, matchesLastHour: 0, totalProcessed: 0, uptime: '—' }
  const result = useQuery({
    queryKey: ['certstream-status'],
    queryFn: () => api<CertStreamStatus>('/drp/certstream/status').catch(() => empty),
    staleTime: 15_000,
  })
  return withDemoFallback(result, DEMO_CERTSTREAM_STATUS, d => (d?.totalProcessed ?? 0) > 0)
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
