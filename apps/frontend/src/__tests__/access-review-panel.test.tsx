/**
 * @module __tests__/access-review-panel.test
 * @description Tests for AccessReviewPanel — stats cards, review table,
 * filters, confirm/disable actions, quarterly summary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { AccessReviewPanel } from '@/components/command-center/AccessReviewPanel'

// ─── Mock hooks ──────────────────────────────────────────────

const mockMutate = vi.fn()

vi.mock('@/hooks/use-access-reviews', () => ({
  useAccessReviewStats: () => ({
    data: { pending: 5, autoDisabled: 2, confirmed: 18 },
    isLoading: false, isDemo: false,
  }),
  useAccessReviews: (_filters: any) => ({
    data: {
      data: [
        { id: 'r1', userId: 'u1', userName: 'Stale Admin', userEmail: 'admin@old.com', orgName: 'ACME Corp', reviewType: 'stale_super_admin', status: 'pending', autoDisabled: false, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z' },
        { id: 'r2', userId: 'u2', userName: 'Inactive User', userEmail: 'user@idle.com', orgName: 'ACME Corp', reviewType: 'stale_user', status: 'pending', autoDisabled: true, createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-24T00:00:00Z' },
        { id: 'r3', userId: 'u3', userName: 'Active User', userEmail: 'active@corp.com', orgName: 'Beta Inc', reviewType: 'quarterly_review', status: 'confirmed', autoDisabled: false, createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-20T15:00:00Z', reviewedBy: 'admin@beta.com' },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false, isDemo: false,
  }),
  useAccessReviewAction: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useQuarterlyReview: () => ({
    data: {
      totalUsers: 48, activeUsers: 42, inactiveUsers: 6, mfaAdoptionPercent: 78,
      ssoUsers: 15, roleBreakdown: { super_admin: 3, tenant_admin: 8, analyst: 25, viewer: 12 },
      usersAddedThisQuarter: 7, usersRemovedThisQuarter: 2, staleAccounts: 4,
    },
    isLoading: false, isDemo: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'u0', role: 'super_admin', tenantId: 't1' }, tenant: { plan: 'teams' } }),
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

// ─── Tests ──────────────────────────────────────────────────

describe('AccessReviewPanel', () => {
  beforeEach(() => { mockMutate.mockClear() })

  it('renders stats cards with correct counts', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    const statsCards = screen.getByTestId('review-stats-cards')
    expect(statsCards).toBeInTheDocument()
    expect(statsCards.textContent).toContain('5')
    expect(statsCards.textContent).toContain('2')
    expect(statsCards.textContent).toContain('18')
  })

  it('renders review table with all review types', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    expect(screen.getByTestId('reviews-table')).toBeInTheDocument()
    expect(screen.getByText('Stale Admin')).toBeInTheDocument()
    expect(screen.getByText('Inactive User')).toBeInTheDocument()
    expect(screen.getByText('Active User')).toBeInTheDocument()
  })

  it('shows correct review type badges', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    const table = screen.getByTestId('reviews-table')
    expect(table.textContent).toContain('Stale Super Admin (60+ days)')
    expect(table.textContent).toContain('Stale User (90+ days)')
    expect(table.textContent).toContain('Quarterly Review')
  })

  it('shows correct status badges including auto-disabled', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    const table = screen.getByTestId('reviews-table')
    expect(table.textContent).toContain('Pending')
    expect(table.textContent).toContain('Auto-Disabled (14d)')
    expect(table.textContent).toContain('Confirmed')
  })

  it('shows confirm and disable buttons for pending reviews', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    expect(screen.getByTestId('confirm-btn-r1')).toBeInTheDocument()
    expect(screen.getByTestId('disable-btn-r1')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-btn-r2')).toBeInTheDocument()
  })

  it('does not show action buttons for confirmed reviews', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    expect(screen.queryByTestId('confirm-btn-r3')).not.toBeInTheDocument()
  })

  it('opens confirm modal with notes textarea', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    fireEvent.click(screen.getByTestId('confirm-btn-r1'))
    expect(screen.getByTestId('confirm-notes')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-submit')).toBeInTheDocument()
  })

  it('confirm action calls mutate with correct params', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    fireEvent.click(screen.getByTestId('confirm-btn-r1'))
    fireEvent.change(screen.getByTestId('confirm-notes'), { target: { value: 'Still needed' } })
    fireEvent.click(screen.getByTestId('confirm-submit'))
    expect(mockMutate).toHaveBeenCalledWith(
      { reviewId: 'r1', action: 'confirmed', notes: 'Still needed' },
      expect.any(Object),
    )
  })

  it('opens disable modal with warning', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    fireEvent.click(screen.getByTestId('disable-btn-r1'))
    expect(screen.getByText(/immediately disable the user/)).toBeInTheDocument()
    expect(screen.getByTestId('disable-submit')).toBeInTheDocument()
  })

  it('disable action calls mutate with correct params', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    fireEvent.click(screen.getByTestId('disable-btn-r1'))
    fireEvent.click(screen.getByTestId('disable-submit'))
    expect(mockMutate).toHaveBeenCalledWith(
      { reviewId: 'r1', action: 'disabled' },
      expect.any(Object),
    )
  })

  it('renders filter dropdowns', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    expect(screen.getByTestId('filter-review-type')).toBeInTheDocument()
    expect(screen.getByTestId('filter-action')).toBeInTheDocument()
  })

  it('super admin sees stale_super_admin filter option', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    const typeFilter = screen.getByTestId('filter-review-type') as HTMLSelectElement
    const options = Array.from(typeFilter.options).map(o => o.value)
    expect(options).toContain('stale_super_admin')
  })

  it('tenant admin does not see stale_super_admin filter option', () => {
    render(<AccessReviewPanel isSuperAdmin={false} />)
    const typeFilter = screen.getByTestId('filter-review-type') as HTMLSelectElement
    const options = Array.from(typeFilter.options).map(o => o.value)
    expect(options).not.toContain('stale_super_admin')
  })

  it('renders quarterly section with stats', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    const quarterly = screen.getByTestId('quarterly-section')
    expect(quarterly).toBeInTheDocument()
    expect(quarterly.textContent).toContain('48')
    expect(quarterly.textContent).toContain('78%')
  })

  it('renders role distribution bars', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    expect(screen.getByText('super admin')).toBeInTheDocument()
    expect(screen.getByText('analyst')).toBeInTheDocument()
  })

  it('renders MFA adoption progress bar', () => {
    render(<AccessReviewPanel isSuperAdmin />)
    const quarterly = screen.getByTestId('quarterly-section')
    expect(quarterly.textContent).toContain('MFA Adoption')
  })
})
