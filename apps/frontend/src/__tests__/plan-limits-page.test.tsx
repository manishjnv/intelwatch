/**
 * Tests for PlanLimitsPage:
 * - 4 plan cards with editable fields
 * - Save/Reset actions
 * - Comparison table
 * - Demo fallback, admin guard, mobile responsive
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockUpdatePlan = vi.fn()
const mockResetPlan = vi.fn()

const MOCK_PLANS = [
  { id: 'free', planName: 'Free', maxPrivateFeeds: 2, maxGlobalSubscriptions: 5, minFetchIntervalMinutes: 240, retentionDays: 30, aiEnabled: false, dailyTokenBudget: 0 },
  { id: 'starter', planName: 'Starter', maxPrivateFeeds: 10, maxGlobalSubscriptions: 20, minFetchIntervalMinutes: 60, retentionDays: 90, aiEnabled: true, dailyTokenBudget: 50000 },
  { id: 'teams', planName: 'Teams', maxPrivateFeeds: 50, maxGlobalSubscriptions: 100, minFetchIntervalMinutes: 30, retentionDays: 365, aiEnabled: true, dailyTokenBudget: 500000 },
  { id: 'enterprise', planName: 'Enterprise', maxPrivateFeeds: -1, maxGlobalSubscriptions: -1, minFetchIntervalMinutes: 15, retentionDays: -1, aiEnabled: true, dailyTokenBudget: -1 },
]

const mockRefetch = vi.fn()

vi.mock('@/hooks/use-plan-limits', () => ({
  usePlanLimits: vi.fn(() => ({
    plans: MOCK_PLANS,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    updatePlan: mockUpdatePlan,
    isUpdating: false,
    resetPlan: mockResetPlan,
    isResetting: false,
  })),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: any) => selector({
    user: { displayName: 'Admin', email: 'admin@test.com', role: 'super_admin' },
    tenant: { name: 'ACME Corp' },
    accessToken: 'mock-token',
  })),
}))

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
}))

vi.mock('@/hooks/use-auth', () => ({
  useLogout: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: vi.fn(() => ({ data: { totalIOCs: 0, criticalIOCs: 0, activeFeeds: 0, enrichedToday: 0, lastIngestTime: 'Demo' } })),
  useIOCs: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useFeeds: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

import { PlanLimitsPage } from '@/pages/PlanLimitsPage'
import { usePlanLimits } from '@/hooks/use-plan-limits'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PlanLimitsPage', () => {
  it('renders 4 plan cards (Free, Starter, Teams, Enterprise)', () => {
    render(<PlanLimitsPage />)
    expect(screen.getByTestId('plan-card-free')).toBeInTheDocument()
    expect(screen.getByTestId('plan-card-starter')).toBeInTheDocument()
    expect(screen.getByTestId('plan-card-teams')).toBeInTheDocument()
    expect(screen.getByTestId('plan-card-enterprise')).toBeInTheDocument()
  })

  it('each card shows all 6 editable fields', () => {
    render(<PlanLimitsPage />)
    const fields = ['maxPrivateFeeds', 'maxGlobalSubscriptions', 'minFetchIntervalMinutes', 'retentionDays', 'aiEnabled', 'dailyTokenBudget']
    for (const f of fields) {
      expect(screen.getByTestId(`field-free-${f}`)).toBeInTheDocument()
    }
  })

  it('editing field marks card as unsaved (yellow dot)', () => {
    render(<PlanLimitsPage />)
    const input = screen.getByTestId('field-free-maxPrivateFeeds') as HTMLInputElement
    fireEvent.change(input, { target: { value: '10' } })
    expect(screen.getByTestId('unsaved-free')).toBeInTheDocument()
  })

  it('Save button calls API with correct planId and changes', () => {
    render(<PlanLimitsPage />)
    const input = screen.getByTestId('field-starter-maxPrivateFeeds') as HTMLInputElement
    fireEvent.change(input, { target: { value: '25' } })
    const saveBtn = screen.getByTestId('save-starter')
    fireEvent.click(saveBtn)
    expect(mockUpdatePlan).toHaveBeenCalledWith({ planId: 'starter', changes: { maxPrivateFeeds: 25 } })
  })

  it('Reset to Defaults restores original values', () => {
    render(<PlanLimitsPage />)
    const resetBtn = screen.getByTestId('reset-teams')
    fireEvent.click(resetBtn)
    expect(mockResetPlan).toHaveBeenCalledWith('teams')
  })

  it('-1 displays as Unlimited in UI', () => {
    render(<PlanLimitsPage />)
    // Enterprise has maxPrivateFeeds=-1
    const card = screen.getByTestId('plan-card-enterprise')
    expect(card.textContent).toContain('Unlimited')
  })

  it('AI Enabled toggle works', () => {
    render(<PlanLimitsPage />)
    const toggle = screen.getByTestId('field-free-aiEnabled')
    fireEvent.click(toggle)
    // Should now mark free card as dirty
    expect(screen.getByTestId('unsaved-free')).toBeInTheDocument()
  })

  it('comparison table renders all plans × features', () => {
    render(<PlanLimitsPage />)
    const table = screen.getByTestId('comparison-table')
    expect(table).toBeInTheDocument()
    expect(table.textContent).toContain('Max Private Feeds')
    expect(table.textContent).toContain('Free')
    expect(table.textContent).toContain('Enterprise')
  })

  it('shows an honest error banner with Retry when plan limits fail to load (DECISION-048)', () => {
    vi.mocked(usePlanLimits).mockReturnValueOnce({
      plans: [],
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: mockRefetch,
      updatePlan: mockUpdatePlan,
      isUpdating: false,
      resetPlan: mockResetPlan,
      isResetting: false,
    })
    render(<PlanLimitsPage />)
    expect(screen.getByTestId('plan-limits-error')).toBeInTheDocument()
  })

  it('shows an honest empty state when no plan tiers are configured yet', () => {
    vi.mocked(usePlanLimits).mockReturnValueOnce({
      plans: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      updatePlan: mockUpdatePlan,
      isUpdating: false,
      resetPlan: mockResetPlan,
      isResetting: false,
    })
    render(<PlanLimitsPage />)
    expect(screen.getByTestId('plan-limits-empty')).toBeInTheDocument()
  })

  it('mobile responsive: cards stack vertically', () => {
    render(<PlanLimitsPage />)
    const grid = screen.getByTestId('plan-cards')
    expect(grid.classList.contains('grid')).toBe(true)
    expect(grid.classList.contains('grid-cols-1')).toBe(true)
  })
})
