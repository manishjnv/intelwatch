/**
 * @module hooks/use-enrichment-data
 * @description TanStack Query hooks for AI Enrichment Service (port 3006).
 * Endpoints: /enrichment/stats, /enrichment/pending, /enrichment/trigger,
 * /enrichment/batch, /enrichment/cost/stats, /enrichment/cost/ioc/:id,
 * /enrichment/cost/budget.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
// Demo data imports removed — no fallback to fake data

// ─── Types ──────────────────────────────────────────────────────

export interface EnrichmentStats {
  total: number
  enriched: number
  pending: number
  failed: number
  enrichedToday: number
  avgQualityScore: number
  cacheHitRate: number
}

export interface PendingIOC {
  id: string
  iocType: string
  normalizedValue: string
  confidence: number
  severity: string
  createdAt: string
}

export interface EvidenceSource {
  provider: string
  dataPoint: string
  interpretation: string
}

export interface MitreTechnique {
  techniqueId: string
  name: string
  tactic: string
}

export interface RecommendedAction {
  action: string
  priority: 'immediate' | 'short_term' | 'long_term'
}

export interface Geolocation {
  countryCode: string
  isp: string
  usageType: string
  isTor: boolean
}

export interface CostEntry {
  provider: string
  model: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  timestamp: string
}

export interface IOCCostBreakdown {
  iocId: string
  providers: CostEntry[]
  totalTokens: number
  totalCostUsd: number
  providerCount: number
}

export interface ProviderCostData {
  count: number
  costUsd: number
  tokens: number
}

export interface TypeCostData {
  count: number
  costUsd: number
}

export interface CostStats {
  headline: string
  totalIOCsEnriched: number
  totalCostUsd: number
  totalTokens: number
  byProvider: Record<string, ProviderCostData>
  byIOCType: Record<string, TypeCostData>
  since: string
}

export interface BudgetStatus {
  tenantId: string
  currentSpendUsd: number
  dailyLimitUsd: number
  percentUsed: number
  isOverBudget: boolean
}

export interface BatchSubmission {
  batchId: string
  status: string
  itemCount: number
}

export interface BatchStatus {
  batchId: string
  status: string
  progress: number
  total: number
  completed: number
  failed: number
}

/** Enrichment result stored on IOC record */
export interface EnrichmentResult {
  enrichmentStatus: 'enriched' | 'partial' | 'pending' | 'failed' | 'skipped' | 'not_selected'
  enrichedAt: string | null
  externalRiskScore: number | null
  enrichmentQuality: number | null
  failureReason: string | null
  geolocation: Geolocation | null
  haikuResult: {
    riskScore: number
    confidence: number
    severity: string
    threatCategory: string
    reasoning: string
    scoreJustification: string
    evidenceSources: EvidenceSource[]
    uncertaintyFactors: string[]
    mitreTechniques: MitreTechnique[]
    isFalsePositive: boolean
    falsePositiveReason: string | null
    malwareFamilies: string[]
    attributedActors: string[]
    recommendedActions: RecommendedAction[]
    stixLabels: string[]
    tags: string[]
    cacheReadTokens: number
    cacheCreationTokens: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    durationMs: number
  } | null
  vtResult: {
    malicious: number
    suspicious: number
    harmless: number
    undetected: number
    totalEngines: number
    detectionRate: number
    tags: string[]
    lastAnalysisDate: string | null
  } | null
  abuseipdbResult: {
    abuseConfidenceScore: number
    totalReports: number
    numDistinctUsers: number
    lastReportedAt: string | null
    isp: string
    countryCode: string
    usageType: string
    isWhitelisted: boolean
    isTor: boolean
  } | null
}

// ─── Hooks ──────────────────────────────────────────────────────

/** Enrichment aggregate stats (total/enriched/pending) */
export function useEnrichmentStats() {
  const result = useQuery({
    queryKey: ['enrichment-stats'],
    queryFn: () => api<EnrichmentStats>('/enrichment/stats'),
    staleTime: 30_000,
    meta: { resource: 'enrichment stats' },
  })
  return { ...result, data: result.data ?? null }
}

/** Pending IOCs awaiting enrichment */
export function useEnrichmentPending(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['enrichment-pending', page, limit],
    // Backend sends { data: PendingIOC[], total, page, limit } single-wrapped; apiList()
    // normalizes it (api() alone would drop total/page/limit — RCA #45).
    queryFn: () => apiList<PendingIOC>(`/enrichment/pending?page=${page}&limit=${limit}`)
      .catch(() => ({ data: [] as PendingIOC[], total: 0, page: 1, limit: 20 })),
    staleTime: 15_000,
  })
}

/** Trigger manual enrichment for a single IOC */
export function useTriggerEnrichment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (iocId: string) => api<{ iocId: string; status: string; message: string }>(
      '/enrichment/trigger', { method: 'POST', body: { iocId } },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrichment-stats'] })
      qc.invalidateQueries({ queryKey: ['enrichment-pending'] })
    },
  })
}

/** Submit batch enrichment */
export function useBatchEnrichment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (iocIds: string[]) => api<BatchSubmission>(
      '/enrichment/batch', { method: 'POST', body: { iocIds } },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrichment-stats'] })
      qc.invalidateQueries({ queryKey: ['enrichment-pending'] })
    },
  })
}

/** Check batch status */
export function useBatchStatus(batchId: string | null) {
  return useQuery({
    queryKey: ['enrichment-batch', batchId],
    queryFn: () => api<BatchStatus>(`/enrichment/batch/${batchId}`),
    enabled: !!batchId,
    refetchInterval: 5000,
  })
}

/** Fetch enrichment result for a single IOC by ID */
export function useIOCEnrichment(iocId: string | null) {
  return useQuery({
    queryKey: ['enrichment-ioc', iocId],
    queryFn: () => api<EnrichmentResult>(`/enrichment/ioc/${iocId}`).catch(() => null),
    enabled: !!iocId,
    staleTime: 60_000,
  })
}

/** Aggregate cost stats */
export function useCostStats() {
  const result = useQuery({
    queryKey: ['enrichment-cost-stats'],
    queryFn: () => api<CostStats>('/enrichment/cost/stats'),
    staleTime: 60_000,
    meta: { resource: 'cost stats' },
  })
  return { ...result, data: result.data ?? null }
}

/** Per-IOC cost breakdown */
export function useIOCCost(iocId: string | null) {
  return useQuery({
    queryKey: ['enrichment-cost-ioc', iocId],
    queryFn: () => api<IOCCostBreakdown>(`/enrichment/cost/ioc/${iocId}`),
    enabled: !!iocId,
    staleTime: 60_000,
  })
}

/** Tenant budget status */
export function useBudgetStatus() {
  const result = useQuery({
    queryKey: ['enrichment-budget'],
    queryFn: () => api<BudgetStatus>('/enrichment/cost/budget'),
    staleTime: 30_000,
    meta: { resource: 'budget status' },
  })
  return { ...result, data: result.data ?? null }
}

// ─── Enrichment Source Breakdown ─────────────────────────────────

export interface SourceBreakdown {
  success: number
  total: number
  rate: number
}

export interface EnrichmentSourceData {
  avgQuality: number
  enrichedCount: number
  unenrichedCount: number
  enrichedPercent: number
  bySource: Record<string, SourceBreakdown>
}

/** Enrichment source breakdown for dashboard widget */
export function useEnrichmentSourceBreakdown() {
  const result = useQuery({
    queryKey: ['enrichment-source-breakdown'],
    // ponytail: /analytics/enrichment-quality actually returns confidence-tier stats
    // (see EnrichmentQuality below), not a per-source breakdown — the backend has no
    // such endpoint yet. Only trust a response that actually has `bySource`, so this
    // never crashes on the real shape and is honest that the data isn't there.
    queryFn: () => api<Partial<EnrichmentSourceData>>('/analytics/enrichment-quality'),
    staleTime: 300_000,
    meta: { resource: 'enrichment source breakdown' },
  })
  const data = result.data?.bySource ? (result.data as EnrichmentSourceData) : null
  return { ...result, data }
}

// ─── AI Cost Summary ─────────────────────────────────────────────

// ponytail: matches the real analytics-service /cost-tracking shape (CostTrackingData
// in aggregator.ts). There is no 30-day delta or monthly budget on the backend today —
// dropped rather than fabricated; use useBudgetStatus() for real (daily) budget data.
export interface AiCostSummary {
  totalCostUsd: number
  byModel: Record<string, number>
  costPerArticle: number
  costPerIoc: number
}

/** AI cost summary (all-time, as reported by the backend) for dashboard widget */
export function useAiCostSummary() {
  const result = useQuery({
    queryKey: ['ai-cost-summary'],
    queryFn: () => api<AiCostSummary>('/analytics/cost-tracking'),
    staleTime: 300_000,
    meta: { resource: 'AI cost summary' },
  })
  return { ...result, data: result.data ?? null }
}

// ─── Enrichment Quality (from analytics service) ────────────────

export interface EnrichmentQuality {
  total: number
  highConfidence: number
  mediumConfidence: number
  lowConfidence: number
  pendingEnrichment: number
  highPct: number
  mediumPct: number
  lowPct: number
}

/** Confidence tier breakdown — sourced from analytics aggregator (5-min cache) */
export function useEnrichmentQuality() {
  const result = useQuery({
    queryKey: ['enrichment-quality'],
    queryFn: () => api<EnrichmentQuality>('/analytics/enrichment-quality'),
    staleTime: 300_000,
    meta: { resource: 'enrichment quality' },
  })
  return { ...result, data: result.data ?? null }
}
