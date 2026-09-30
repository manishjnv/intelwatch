/**
 * @module hooks/use-access-reviews
 * @description React Query hooks for access review management.
 * Super admin: GET/PUT /admin/access-reviews, GET /admin/access-reviews/stats,
 *              GET /admin/access-reviews/quarterly
 * Tenant admin: GET/PUT /settings/access-reviews, GET /settings/access-reviews/quarterly
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import { useAuthStore } from '@/stores/auth-store'

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

// Backend (apps/user-service/src/access-review-service.ts generateQuarterlyReview) sends
// differently-named fields — map them so consumers (e.g. QuarterlySection dereferencing
// q.roleBreakdown without a guard) don't crash on the real shape.
interface BackendQuarterlyReview {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  mfaAdoptionRate: number
  ssoUsersCount: number
  roleDistribution: Record<string, number>
  usersAddedInPeriod: number
  usersRemovedInPeriod: number
  staleUsers: number
}

function mapQuarterly(r: BackendQuarterlyReview): QuarterlyReview {
  return {
    totalUsers: r.totalUsers,
    activeUsers: r.activeUsers,
    inactiveUsers: r.inactiveUsers,
    mfaAdoptionPercent: r.mfaAdoptionRate,
    ssoUsers: r.ssoUsersCount,
    roleBreakdown: r.roleDistribution,
    usersAddedThisQuarter: r.usersAddedInPeriod,
    usersRemovedThisQuarter: r.usersRemovedInPeriod,
    staleAccounts: r.staleUsers,
  }
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
    // NOTE (RCA #45 audit): backend has no /admin|settings/access-reviews/stats route
    // at all (only list, :reviewId, quarterly exist under apps/api-gateway/src/routes/access-review.ts).
    // This always 404s — surfaces as isError, honest per DECISION-048, until a real route exists.
    // BLOCKED: needs a real backend stats endpoint (out of scope, not one of this task's owned files).
    queryFn: () => api<AccessReviewStats>(path),
    staleTime: 60_000,
    meta: { resource: 'access review stats' },
  })

  return { ...result, data: result.data ?? null }
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
    queryFn: () => apiList<AccessReview>(`${basePath}${query}`),
    staleTime: 60_000,
    meta: { resource: 'access reviews' },
  })

  return { ...result, data: result.data ?? empty }
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
    // Super-admin path requires ?tenantId=; without it the backend replies { data: [] }
    // (see apps/api-gateway/src/routes/access-review.ts) instead of a QuarterlyReview object.
    // Guard against that array reply so mapQuarterly never dereferences a missing field —
    // honest null (no tenant selected yet), not a fabricated summary.
    queryFn: () =>
      api<BackendQuarterlyReview>(path).then(r => (r && !Array.isArray(r) ? mapQuarterly(r) : null)),
    staleTime: 5 * 60_000,
    meta: { resource: 'quarterly review' },
  })

  return { ...result, data: result.data ?? null }
}
