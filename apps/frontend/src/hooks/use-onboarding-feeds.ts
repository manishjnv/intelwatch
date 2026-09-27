/**
 * @module hooks/use-onboarding-feeds
 * @description Hook for the onboarding feed selection step.
 * Fetches global catalog, manages selections, private feeds, and alert config.
 */
import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types ──────────────────────────────────────────────────────

export interface CatalogFeed {
  id: string
  name: string
  feedType: string
  description?: string
  minPlanTier: string
  enabled: boolean
  subscriberCount?: number
  sourceReliability?: string
  infoCred?: number
}

export interface PrivateFeedEntry {
  id: string
  name: string
  url: string
  feedType: 'rss' | 'rest_api'
}

export interface AlertConfig {
  minSeverity: 'critical' | 'high' | 'medium' | 'low'
  minConfidence: number
  iocTypes: string[]
}

export interface FeedValidationResult {
  valid: boolean
  feedTitle?: string
  articleCount?: number
  error?: string
  responseTimeMs: number
}

// ─── Plan Limits ────────────────────────────────────────────────

const PLAN_FEED_LIMITS: Record<string, number> = {
  free: 5,
  starter: 10,
  teams: Infinity,
  enterprise: Infinity,
}

const PLAN_PRIVATE_LIMITS: Record<string, number> = {
  free: 3,
  starter: 10,
  teams: 50,
  enterprise: 100,
}

const PLAN_TIER_ORDER = ['free', 'starter', 'teams', 'enterprise']

function tierIndex(tier: string): number {
  const idx = PLAN_TIER_ORDER.indexOf(tier)
  return idx >= 0 ? idx : 0
}

const ALL_IOC_TYPES = ['ip', 'domain', 'hash', 'cve', 'url', 'email']

// ─── Hook ───────────────────────────────────────────────────────

export function useOnboardingFeeds(planTier: string) {
  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [privateFeeds, setPrivateFeeds] = useState<PrivateFeedEntry[]>([])
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    minSeverity: 'high',
    minConfidence: 60,
    iocTypes: [...ALL_IOC_TYPES],
  })

  const maxGlobal = PLAN_FEED_LIMITS[planTier] ?? PLAN_FEED_LIMITS.free ?? 5
  const maxPrivate = PLAN_PRIVATE_LIMITS[planTier] ?? PLAN_PRIVATE_LIMITS.free ?? 3
  const tenantTier = tierIndex(planTier)

  // Fetch global catalog
  const { data: globalFeeds = [], isLoading } = useQuery({
    queryKey: ['onboarding-catalog', planTier],
    // Backend (ingestion/routes/catalog.ts GET /) sends { data: feeds } single-wrapped;
    // api() already unwraps it — the old `res?.data` was always undefined (RCA #45).
    // NOTE: catalogRoutes is also not registered in apps/ingestion/src/app.ts (only in its
    // test file), so this endpoint 404s in production regardless of the unwrap fix — a
    // separate route-registration gap outside this pass's scope.
    queryFn: async () => {
      const res = await api<CatalogFeed[]>('/ingestion/catalog')
      return res ?? []
    },
    staleTime: 120_000,
    select: (feeds) => {
      // Auto-select feeds on first load
      if (!initialized && feeds.length > 0) {
        const eligible = feeds
          .filter(f => f.enabled && tierIndex(f.minPlanTier) <= tenantTier)
          .slice(0, maxGlobal)
        setSelectedFeedIds(new Set(eligible.map(f => f.id)))
        setInitialized(true)
      }
      return feeds
    },
  })

  // Computed: which feeds are eligible vs locked
  const { eligibleFeeds, lockedFeeds } = useMemo(() => {
    const eligible: CatalogFeed[] = []
    const locked: CatalogFeed[] = []
    for (const feed of globalFeeds) {
      if (!feed.enabled) continue
      if (tierIndex(feed.minPlanTier) <= tenantTier) {
        eligible.push(feed)
      } else {
        locked.push(feed)
      }
    }
    return { eligibleFeeds: eligible, lockedFeeds: locked }
  }, [globalFeeds, tenantTier])

  const selectedFeeds = useMemo(
    () => globalFeeds.filter(f => selectedFeedIds.has(f.id)),
    [globalFeeds, selectedFeedIds],
  )

  const toggleFeed = useCallback((feedId: string) => {
    setSelectedFeedIds(prev => {
      const next = new Set(prev)
      if (next.has(feedId)) {
        next.delete(feedId)
      } else if (next.size < maxGlobal) {
        next.add(feedId)
      }
      return next
    })
  }, [maxGlobal])

  const selectAll = useCallback(() => {
    const ids = eligibleFeeds.slice(0, maxGlobal).map(f => f.id)
    setSelectedFeedIds(new Set(ids))
  }, [eligibleFeeds, maxGlobal])

  const deselectAll = useCallback(() => {
    setSelectedFeedIds(new Set())
  }, [])

  // Private feeds management
  const addPrivateFeed = useCallback((feed: Omit<PrivateFeedEntry, 'id'>) => {
    if (privateFeeds.length >= maxPrivate) return
    setPrivateFeeds(prev => [...prev, { ...feed, id: `private-${Date.now()}` }])
  }, [privateFeeds.length, maxPrivate])

  const removePrivateFeed = useCallback((id: string) => {
    setPrivateFeeds(prev => prev.filter(f => f.id !== id))
  }, [])

  // Feed validation
  const testFeed = useCallback(async (url: string, feedType = 'rss'): Promise<FeedValidationResult> => {
    try {
      // Backend (ingestion/routes/feed-validation.ts POST /validate) sends { data: result }
      // single-wrapped; api() already unwraps it — the old `res?.data` was always undefined
      // (RCA #45). NOTE: the route is registered at /api/v1/feeds/validate, not
      // /api/v1/ingestion/feeds/validate — no nginx location or api-gateway route matches this
      // path today, so the call 404s in production regardless of the unwrap fix. A separate
      // path-mismatch bug outside this pass's scope.
      const res = await api<FeedValidationResult>('/ingestion/feeds/validate', {
        method: 'POST',
        body: JSON.stringify({ url, feedType }),
      })
      return res ?? { valid: false, error: 'No response', responseTimeMs: 0 }
    } catch {
      return { valid: false, error: 'Validation failed', responseTimeMs: 0 }
    }
  }, [])

  return {
    globalFeeds,
    eligibleFeeds,
    lockedFeeds,
    selectedFeeds,
    selectedFeedIds,
    toggleFeed,
    selectAll,
    deselectAll,
    privateFeeds,
    addPrivateFeed,
    removePrivateFeed,
    testFeed,
    alertConfig,
    setAlertConfig,
    maxGlobal,
    maxPrivate,
    isLoading,
  }
}
