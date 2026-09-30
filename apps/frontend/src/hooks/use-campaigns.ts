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

// ─── Hooks ──────────────────────────────────────────────────────

export function useCampaigns(params: { minFeeds?: number; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.minFeeds != null) qs.set('minFeeds', String(params.minFeeds))
  if (params.limit != null) qs.set('limit', String(params.limit))
  const query = qs.toString() ? `?${qs}` : ''
  const empty: CampaignListResponse = { data: [], total: 0 }

  return useQuery({
    queryKey: ['campaigns', params],
    queryFn: () =>
      api<CampaignListResponse>(`/ioc/campaigns${query}`)
        .then(r => r ?? empty)
        .catch(err => notifyApiError(err, 'campaigns', empty)),
    staleTime: 60_000,
  })
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
