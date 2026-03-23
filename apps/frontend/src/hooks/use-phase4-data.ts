/**
 * @module hooks/use-phase4-data
 * @description TanStack Query hooks for Phase 4 services:
 * DRP (:3011), Threat Graph (:3012), Correlation Engine (:3013), Hunting (:3014).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  DEMO_DRP_ALERTS, DEMO_DRP_ALERT_STATS, DEMO_DRP_ASSETS, DEMO_DRP_ASSET_STATS,
  DEMO_CERTSTREAM_STATUS,
  DEMO_GRAPH_NODES, DEMO_GRAPH_EDGES, DEMO_GRAPH_STATS,
  DEMO_CORRELATIONS, DEMO_CORRELATION_STATS, DEMO_CAMPAIGNS,
  DEMO_HUNT_SESSIONS, DEMO_HUNT_STATS, DEMO_HUNT_HYPOTHESES,
  DEMO_HUNT_EVIDENCE, DEMO_HUNT_TEMPLATES,
  type DRPAlert, type DRPAlertStats, type DRPAsset, type DRPAssetStats,
  type CertStreamStatus, type TyposquatCandidate,
  type GraphNode, type GraphEdge, type GraphStats, type GraphSubgraph,
  type CorrelationResult, type CorrelationStats, type CampaignCluster,
  type HuntSession, type HuntStats, type HuntHypothesis,
  type HuntEvidence, type HuntTemplate,
} from './phase4-demo-data'

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
    queryFn: () => api<ListResponse<DRPAsset>>(`/drp/assets${query}`).catch(() => empty),
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
    queryFn: () => api<ListResponse<DRPAlert>>(`/drp/alerts${query}`).catch(() => empty),
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

export function useTyposquatScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (domain: string) =>
      api<{ data: { candidates: TyposquatCandidate[]; alertsCreated: number } }>(
        '/drp/detect/typosquat', { method: 'POST', body: { domain } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drp-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['drp-alert-stats'] })
    },
  })
}

// ─── Threat Graph Hooks ─────────────────────────────────────────

export function useGraphNodes(params: QueryParams = {}) {
  const query = buildQuery(params)
  const result = useQuery({
    queryKey: ['graph-nodes', params],
    queryFn: () => api<GraphSubgraph>(`/graph/entity/root${query}`).catch(() => ({ nodes: [], edges: [] })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { nodes: DEMO_GRAPH_NODES, edges: DEMO_GRAPH_EDGES },
    d => (d?.nodes?.length ?? 0) > 0,
  )
}

export function useGraphStats() {
  const empty: GraphStats = { totalNodes: 0, totalEdges: 0, byType: {}, avgRiskScore: 0 }
  const result = useQuery({
    queryKey: ['graph-stats'],
    queryFn: () => api<GraphStats>('/graph/stats').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_GRAPH_STATS, d => (d?.totalNodes ?? 0) > 0)
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
    queryFn: () => api<GraphSubgraph>(`/graph/entity/${nodeId}?hops=1&limit=20`).catch(() => ({ nodes: [], edges: [] })),
    enabled: !!nodeId,
    staleTime: 60_000,
  })
}

// ─── Correlation Hooks ──────────────────────────────────────────

export function useCorrelations(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty: ListResponse<CorrelationResult> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['correlations', params],
    queryFn: () => api<ListResponse<CorrelationResult>>(`/correlations${query}`).catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result,
    { data: DEMO_CORRELATIONS, total: DEMO_CORRELATIONS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useCorrelationStats() {
  const empty: CorrelationStats = { total: 0, byType: {}, bySeverity: {}, suppressedCount: 0, avgConfidence: 0 }
  const result = useQuery({
    queryKey: ['correlation-stats'],
    queryFn: () => api<CorrelationStats>('/correlations/stats').catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_CORRELATION_STATS, d => (d?.total ?? 0) > 0)
}

export function useCampaigns() {
  const result = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<ListResponse<CampaignCluster>>('/correlations/campaigns').catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_CAMPAIGNS, total: DEMO_CAMPAIGNS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useTriggerCorrelation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<unknown>('/correlations/correlate', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlations'] })
      queryClient.invalidateQueries({ queryKey: ['correlation-stats'] })
    },
  })
}

// ─── Hunting Hooks ──────────────────────────────────────────────

export function useHuntSessions(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty: ListResponse<HuntSession> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['hunt-sessions', params],
    queryFn: () => api<ListResponse<HuntSession>>(`/hunts${query}`).catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result,
    { data: DEMO_HUNT_SESSIONS, total: DEMO_HUNT_SESSIONS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useHuntStats() {
  const empty: HuntStats = { total: 0, active: 0, completed: 0, totalFindings: 0, avgScore: 0, byType: {} }
  const result = useQuery({
    queryKey: ['hunt-stats'],
    queryFn: () => api<HuntStats>('/hunts/stats').catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_HUNT_STATS, d => (d?.total ?? 0) > 0)
}

export function useHuntHypotheses(huntId: string | null) {
  const result = useQuery({
    queryKey: ['hunt-hypotheses', huntId],
    queryFn: () => api<ListResponse<HuntHypothesis>>(`/hunts/${huntId}/hypotheses`).catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    enabled: !!huntId,
    staleTime: 30_000,
  })
  const demoFiltered = DEMO_HUNT_HYPOTHESES.filter(h => h.huntId === huntId)
  return withDemoFallback(result,
    { data: demoFiltered, total: demoFiltered.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useHuntEvidence(huntId: string | null) {
  const result = useQuery({
    queryKey: ['hunt-evidence', huntId],
    queryFn: () => api<ListResponse<HuntEvidence>>(`/hunts/${huntId}/evidence`).catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    enabled: !!huntId,
    staleTime: 30_000,
  })
  const demoFiltered = DEMO_HUNT_EVIDENCE.filter(e => e.huntId === huntId)
  return withDemoFallback(result,
    { data: demoFiltered, total: demoFiltered.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useHuntTemplates() {
  const result = useQuery({
    queryKey: ['hunt-templates'],
    queryFn: () => api<{ data: HuntTemplate[]; total: number }>('/hunts/templates').catch(() => ({ data: [], total: 0 })),
    staleTime: 5 * 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_HUNT_TEMPLATES, total: DEMO_HUNT_TEMPLATES.length },
    d => (d?.data?.length ?? 0) > 0,
  )
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
