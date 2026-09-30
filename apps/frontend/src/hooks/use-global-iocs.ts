/**
 * @module hooks/use-global-iocs
 * @description TanStack Query hooks for Global IOCs and tenant overlays.
 * DECISION-029 Phase C.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────

export interface GlobalIocRecord {
  id: string
  iocType: string
  value: string
  normalizedValue: string
  dedupeHash: string
  confidence: number
  severity: string
  stixConfidenceTier: string
  lifecycle: string
  crossFeedCorroboration: number
  sightingSources: string[]
  firstSeen: string
  lastSeen: string
  enrichmentQuality: number
  warninglistMatch: string | null
  enrichmentData: {
    shodan?: { org?: string; isp?: string; country?: string; ports?: number[]; vulns?: string[]; riskScore?: number }
    greynoise?: { classification?: string; noise?: boolean; riot?: boolean }
    epss?: { probability?: number; percentile?: number }
    sources?: { source: string; data: unknown; timestamp: string; success: boolean }[]
  }
  attackTechniques?: string[]
  affectedCpes?: string[]
  // Overlay fields (from tenant overlay, if any)
  overlay?: {
    customSeverity?: string
    customConfidence?: number
    customLifecycle?: string
    customTags?: string[]
    customNotes?: string
  }
}

export interface OverlayInput {
  customSeverity?: string
  customConfidence?: number
  customLifecycle?: string
  customTags?: string[]
  customNotes?: string
}

// ─── Hooks ──────────────────────────────────────────────────

export function useGlobalIocs(filters?: Record<string, string | number | undefined>) {
  const empty: GlobalIocRecord[] = []
  const params = filters
    ? '?' + Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : ''
  return useQuery({
    queryKey: ['global-iocs', filters],
    queryFn: () =>
      api<GlobalIocRecord[]>(`/normalization/global-iocs${params}`)
        .catch(err => notifyApiError(err, 'global IOCs', empty)),
    staleTime: 60_000,
  })
}

export function useGlobalIocDetail(iocId: string | null) {
  return useQuery({
    queryKey: ['global-ioc-detail', iocId],
    queryFn: () =>
      api<GlobalIocRecord>(`/normalization/global-iocs/${iocId}`)
        .catch(() => null),
    enabled: !!iocId,
    staleTime: 60_000,
  })
}

// ─── Corroboration / Voting / FP Hooks ─────────────────────

export interface CorroborationDetail {
  score: number
  sourceCount: number
  weightedSourceCount: number
  independenceScore: number
  consensusSeverity: string
  tier: 'uncorroborated' | 'low' | 'medium' | 'high' | 'confirmed'
  narrative: string
  sources: Array<{ feedId: string; feedName: string; admiraltySource: string; firstSeenByFeed: string; lastSeenByFeed: string }>
}

export interface SeverityVoteDetail {
  currentSeverity: string
  totalVotes: number
  voteBreakdown: Record<string, { weight: number; voterCount: number }>
  confidence: number
  margin: number
}

export interface FpSummaryDetail {
  fpCount: number
  fpRate: number
  totalTenants: number
  reports: Array<{ tenantId: string; reason: string; reportedAt: string }>
  autoAction: 'downgraded' | 'marked_fp' | null
}

export function useCorroborationDetail(iocId: string | null) {
  return useQuery({
    queryKey: ['global-ioc-corroboration', iocId],
    queryFn: () =>
      api<CorroborationDetail>(`/normalization/global-iocs/${iocId}/corroboration`)
        .catch(() => null),
    enabled: !!iocId,
    staleTime: 60_000,
  })
}

export function useSeverityVotes(iocId: string | null) {
  return useQuery({
    queryKey: ['global-ioc-severity-votes', iocId],
    queryFn: () =>
      api<SeverityVoteDetail>(`/normalization/global-iocs/${iocId}/severity-votes`)
        .catch(() => null),
    enabled: !!iocId,
    staleTime: 60_000,
  })
}

export function useFpSummary(iocId: string | null) {
  return useQuery({
    queryKey: ['global-ioc-fp-summary', iocId],
    queryFn: () =>
      api<FpSummaryDetail>(`/normalization/global-iocs/${iocId}/fp-summary`)
        .catch(() => null),
    enabled: !!iocId,
    staleTime: 60_000,
  })
}

export function useFpActions(iocId: string | null) {
  const qc = useQueryClient()

  const reportFp = useMutation({
    mutationFn: (data: { reason: string; notes?: string }) =>
      api(`/normalization/global-iocs/${iocId}/report-fp`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['global-ioc-fp-summary', iocId] })
      void qc.invalidateQueries({ queryKey: ['global-ioc-detail', iocId] })
    },
  })

  const withdrawFp = useMutation({
    mutationFn: () => api(`/normalization/global-iocs/${iocId}/report-fp`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['global-ioc-fp-summary', iocId] })
      void qc.invalidateQueries({ queryKey: ['global-ioc-detail', iocId] })
    },
  })

  return {
    reportFp: reportFp.mutate,
    withdrawFp: withdrawFp.mutate,
    isReporting: reportFp.isPending,
    isWithdrawing: withdrawFp.isPending,
  }
}

export function useIocOverlay(iocId: string | null) {
  const qc = useQueryClient()

  const setOverlay = useMutation({
    mutationFn: (data: OverlayInput) =>
      api(`/normalization/global-iocs/${iocId}/overlay`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['global-ioc-detail', iocId] })
      void qc.invalidateQueries({ queryKey: ['global-iocs'] })
    },
  })

  const removeOverlay = useMutation({
    mutationFn: () => api(`/normalization/global-iocs/${iocId}/overlay`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['global-ioc-detail', iocId] })
      void qc.invalidateQueries({ queryKey: ['global-iocs'] })
    },
  })

  return {
    setOverlay: setOverlay.mutate,
    removeOverlay: removeOverlay.mutate,
    isSaving: setOverlay.isPending,
    isRemoving: removeOverlay.isPending,
  }
}
