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

// ─── Demo Data ──────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

const DEMO_GLOBAL_IOCS: GlobalIocRecord[] = [
  {
    id: 'gioc-1', iocType: 'ip', value: '185.220.101.34', normalizedValue: '185.220.101.34',
    dedupeHash: 'abc123', confidence: 92, severity: 'critical', stixConfidenceTier: 'High',
    lifecycle: 'active', crossFeedCorroboration: 4, sightingSources: ['gf-1', 'gf-2', 'gf-3', 'gf-4'],
    firstSeen: daysAgo(28), lastSeen: daysAgo(0), enrichmentQuality: 85, warninglistMatch: null,
    enrichmentData: {
      shodan: { org: 'Tor Exit Node', isp: 'OVH', country: 'FR', ports: [22, 80, 443], riskScore: 95 },
      greynoise: { classification: 'malicious', noise: true, riot: false },
    },
    attackTechniques: ['T1071.001', 'T1566.001'],
  },
  {
    id: 'gioc-2', iocType: 'domain', value: 'evil-payload.darknet.ru', normalizedValue: 'evil-payload.darknet.ru',
    dedupeHash: 'def456', confidence: 88, severity: 'high', stixConfidenceTier: 'High',
    lifecycle: 'active', crossFeedCorroboration: 3, sightingSources: ['gf-1', 'gf-3', 'gf-5'],
    firstSeen: daysAgo(14), lastSeen: daysAgo(1), enrichmentQuality: 70, warninglistMatch: null,
    enrichmentData: {
      greynoise: { classification: 'malicious', noise: false, riot: false },
    },
  },
  {
    id: 'gioc-3', iocType: 'cve', value: 'CVE-2024-21887', normalizedValue: 'CVE-2024-21887',
    dedupeHash: 'ghi789', confidence: 95, severity: 'critical', stixConfidenceTier: 'High',
    lifecycle: 'active', crossFeedCorroboration: 5, sightingSources: ['gf-2', 'gf-4'],
    firstSeen: daysAgo(30), lastSeen: daysAgo(0), enrichmentQuality: 90, warninglistMatch: null,
    enrichmentData: {
      epss: { probability: 0.95, percentile: 99 },
    },
    affectedCpes: ['cpe:2.3:a:ivanti:connect_secure:*:*:*:*:*:*:*:*'],
  },
  {
    id: 'gioc-4', iocType: 'hash', value: 'a1b2c3d4e5f6...', normalizedValue: 'a1b2c3d4e5f67890',
    dedupeHash: 'jkl012', confidence: 65, severity: 'medium', stixConfidenceTier: 'Med',
    lifecycle: 'new', crossFeedCorroboration: 2, sightingSources: ['gf-3'],
    firstSeen: daysAgo(3), lastSeen: daysAgo(2), enrichmentQuality: 40, warninglistMatch: null,
    enrichmentData: {},
  },
  {
    id: 'gioc-5', iocType: 'ip', value: '198.51.100.23', normalizedValue: '198.51.100.23',
    dedupeHash: 'mno345', confidence: 30, severity: 'info', stixConfidenceTier: 'Low',
    lifecycle: 'aging', crossFeedCorroboration: 1, sightingSources: ['gf-1'],
    firstSeen: daysAgo(45), lastSeen: daysAgo(15), enrichmentQuality: 20,
    warninglistMatch: 'IANA Reserved',
    enrichmentData: {},
  },
]

// ─── Hooks ──────────────────────────────────────────────────

export function useGlobalIocs(filters?: Record<string, string | number | undefined>) {
  const empty: GlobalIocRecord[] = []
  const params = filters
    ? '?' + Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : ''
  const result = useQuery({
    queryKey: ['global-iocs', filters],
    queryFn: () =>
      api<{ data: GlobalIocRecord[] }>(`/normalization/global-iocs${params}`)
        .then(r => r?.data ?? empty)
        .catch(err => notifyApiError(err, 'global IOCs', empty)),
    staleTime: 60_000,
  })
  const isDemo = !result.isLoading && (result.data?.length ?? 0) === 0
  return { ...result, data: isDemo ? DEMO_GLOBAL_IOCS : result.data, isDemo }
}

export function useGlobalIocDetail(iocId: string | null) {
  return useQuery({
    queryKey: ['global-ioc-detail', iocId],
    queryFn: () =>
      api<{ data: GlobalIocRecord }>(`/normalization/global-iocs/${iocId}`)
        .then(r => r?.data ?? null)
        .catch(() => DEMO_GLOBAL_IOCS[0]),
    enabled: !!iocId,
    staleTime: 60_000,
  })
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
