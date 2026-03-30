/**
 * @module hooks/use-access-reviews
 * @description React Query hooks for access review management.
 * Super admin: GET/PUT /admin/access-reviews, GET /admin/access-reviews/stats,
 *              GET /admin/access-reviews/quarterly
 * Tenant admin: GET/PUT /settings/access-reviews, GET /settings/access-reviews/quarterly
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────

export type ReviewType = 'stale_super_admin' | 'stale_user' | 'quarterly_review'
export type ReviewStatus = 'pending' | 'confirmed' | 'disabled'

export interface AccessReview {
  id: string
  userId: string
  userName: string
  userEmail: string
  orgName: string
  reviewType: ReviewType
  status: ReviewStatus
  autoDisabled: boolean
  createdAt: string
  updatedAt: string
  notes?: string
  reviewedBy?: string
}

export interface AccessReviewStats {
  pending: number
  autoDisabled: number
  confirmed: number
}

export interface QuarterlyReview {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  mfaAdoptionPercent: number
  ssoUsers: number
  roleBreakdown: Record<string, number>
  usersAddedThisQuarter: number
  usersRemovedThisQuarter: number
  staleAccounts: number
}

export interface ReviewFilters {
  page?: number
  limit?: number
  reviewType?: ReviewType | 'all'
  action?: ReviewStatus | 'all'
}

interface ListResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_STATS: AccessReviewStats = { pending: 5, autoDisabled: 2, confirmed: 18 }

const DEMO_REVIEWS: AccessReview[] = [
  { id: 'r1', userId: 'u1', userName: 'Stale Admin', userEmail: 'admin@old.com', orgName: 'ACME Corp', reviewType: 'stale_super_admin', status: 'pending', autoDisabled: false, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z' },
  { id: 'r2', userId: 'u2', userName: 'Inactive User', userEmail: 'user@idle.com', orgName: 'ACME Corp', reviewType: 'stale_user', status: 'pending', autoDisabled: true, createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-24T00:00:00Z' },
  { id: 'r3', userId: 'u3', userName: 'Active User', userEmail: 'active@corp.com', orgName: 'Beta Inc', reviewType: 'quarterly_review', status: 'confirmed', autoDisabled: false, createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-20T15:00:00Z', reviewedBy: 'admin@beta.com' },
]

const DEMO_QUARTERLY: QuarterlyReview = {
  totalUsers: 48, activeUsers: 42, inactiveUsers: 6, mfaAdoptionPercent: 78,
  ssoUsers: 15, roleBreakdown: { super_admin: 3, tenant_admin: 8, analyst: 25, viewer: 12 },
  usersAddedThisQuarter: 7, usersRemovedThisQuarter: 2, staleAccounts: 4,
}

// ─── Helper ─────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'all') parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ─── Hooks ──────────────────────────────────────────────────

/** Fetch access review stats (super admin only). */
export function useAccessReviewStats() {
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const path = isSuperAdmin ? '/admin/access-reviews/stats' : '/settings/access-reviews/stats'

  const result = useQuery({
    queryKey: ['access-review-stats', isSuperAdmin],
    queryFn: () =>
      api<{ data: AccessReviewStats }>(path)
        .then(r => r?.data ?? DEMO_STATS)
        .catch(err => notifyApiError(err, 'access review stats', DEMO_STATS)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && !result.data
  return { ...result, data: result.data ?? DEMO_STATS, isDemo }
}

/** Fetch access reviews list with filters. */
export function useAccessReviews(filters: ReviewFilters = {}) {
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const basePath = isSuperAdmin ? '/admin/access-reviews' : '/settings/access-reviews'
  const query = buildQuery({ page: filters.page ?? 1, limit: filters.limit ?? 50, reviewType: filters.reviewType, action: filters.action })

  const empty: ListResponse<AccessReview> = { data: [], total: 0, page: 1, limit: 50 }

  const result = useQuery({
    queryKey: ['access-reviews', isSuperAdmin, filters],
    queryFn: () =>
      api<ListResponse<AccessReview>>(`${basePath}${query}`)
        .catch(err => notifyApiError(err, 'access reviews', empty)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (result.data?.data?.length ?? 0) === 0
  return {
    ...result,
    data: isDemo ? { data: DEMO_REVIEWS, total: DEMO_REVIEWS.length, page: 1, limit: 50 } : result.data ?? empty,
    isDemo,
  }
}

/** Confirm or disable a review. */
export function useAccessReviewAction() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const basePath = isSuperAdmin ? '/admin/access-reviews' : '/settings/access-reviews'

  return useMutation({
    mutationFn: ({ reviewId, action, notes }: { reviewId: string; action: 'confirmed' | 'disabled'; notes?: string }) =>
      api(`${basePath}/${reviewId}`, { method: 'PUT', body: { action, notes } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['access-reviews'] })
      void qc.invalidateQueries({ queryKey: ['access-review-stats'] })
    },
  })
}

/** Fetch quarterly review summary. */
export function useQuarterlyReview() {
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const path = isSuperAdmin ? '/admin/access-reviews/quarterly' : '/settings/access-reviews/quarterly'

  const result = useQuery({
    queryKey: ['quarterly-review', isSuperAdmin],
    queryFn: () =>
      api<{ data: QuarterlyReview }>(path)
        .then(r => r?.data ?? DEMO_QUARTERLY)
        .catch(err => notifyApiError(err, 'quarterly review', DEMO_QUARTERLY)),
    staleTime: 5 * 60_000,
  })

  const isDemo = !result.isLoading && !result.data
  return { ...result, data: result.data ?? DEMO_QUARTERLY, isDemo }
}
