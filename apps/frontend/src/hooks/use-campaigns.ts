/**
 * @module hooks/use-campaigns
 * @description TanStack Query hooks for IOC Intelligence campaign endpoints.
 * GET /api/v1/ioc/campaigns — list campaigns
 * GET /api/v1/ioc/campaigns/:id — not available (use pivot data)
 * Uses iocId pivot to find campaigns for a specific IOC.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────────

export interface Campaign {
  id: string
  name: string
  status: 'active' | 'suspected' | 'historical'
  severity: string
  confidence: number
  firstSeen: string | null
  lastSeen: string | null
  iocCount: number
  iocTypes: Record<string, number>
  actors: string[]
  malwareFamilies: string[]
  techniques: string[]
}

export interface CampaignListResponse {
  data: Campaign[]
  total: number
}

// ─── Demo Data ──────────────────────────────────────────────────

const DEMO_CAMPAIGNS: CampaignListResponse = {
  data: [
    {
      id: 'camp-1', name: 'APT29 SolarWinds Campaign', status: 'active',
      severity: 'critical', confidence: 85, firstSeen: '2024-12-01T00:00:00Z',
      lastSeen: '2025-03-15T00:00:00Z', iocCount: 47,
      iocTypes: { ip: 12, domain: 18, hash_sha256: 10, url: 7 },
      actors: ['APT29', 'Cozy Bear'], malwareFamilies: ['SUNBURST', 'TEARDROP'],
      techniques: ['T1190', 'T1059', 'T1078'],
    },
    {
      id: 'camp-2', name: 'Emotet Wave Q1 2025', status: 'suspected',
      severity: 'high', confidence: 62, firstSeen: '2025-01-10T00:00:00Z',
      lastSeen: '2025-03-20T00:00:00Z', iocCount: 31,
      iocTypes: { ip: 8, domain: 12, hash_sha256: 6, email: 5 },
      actors: ['TA542'], malwareFamilies: ['Emotet', 'TrickBot'],
      techniques: ['T1566', 'T1204', 'T1059'],
    },
    {
      id: 'camp-3', name: 'Log4Shell Exploitation', status: 'historical',
      severity: 'critical', confidence: 94, firstSeen: '2024-06-01T00:00:00Z',
      lastSeen: '2024-11-30T00:00:00Z', iocCount: 83,
      iocTypes: { ip: 30, domain: 25, url: 15, hash_sha256: 13 },
      actors: ['Multiple'], malwareFamilies: ['Mirai', 'Kinsing'],
      techniques: ['T1190', 'T1059', 'T1105'],
    },
  ],
  total: 3,
}

// ─── Hooks ──────────────────────────────────────────────────────

export function useCampaigns(params: { minFeeds?: number; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.minFeeds != null) qs.set('minFeeds', String(params.minFeeds))
  if (params.limit != null) qs.set('limit', String(params.limit))
  const query = qs.toString() ? `?${qs}` : ''

  const result = useQuery({
    queryKey: ['campaigns', params],
    queryFn: () =>
      api<CampaignListResponse>(`/ioc/campaigns${query}`)
        .then(r => r ?? DEMO_CAMPAIGNS)
        .catch(err => notifyApiError(err, 'campaigns', DEMO_CAMPAIGNS)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (!result.data || (result.data?.data?.length ?? 0) === 0)
  return {
    ...result,
    data: isDemo ? DEMO_CAMPAIGNS : result.data,
    isDemo,
  }
}

export function useCampaignsForIoc(iocId: string | null) {
  // Uses the IOC pivot endpoint which returns campaigns for a given IOC
  const result = useQuery({
    queryKey: ['ioc-campaigns', iocId],
    queryFn: () =>
      iocId
        ? api<{ campaigns: { id: string; name: string }[] }>(`/iocs/${iocId}/pivot`)
            .then(r => r?.campaigns ?? [])
            .catch(() => [] as { id: string; name: string }[])
        : ([] as { id: string; name: string }[]),
    enabled: !!iocId,
    staleTime: 60_000,
  })
  return result
}
