/**
 * Tests for GlobalAiConfigPage:
 * - Model assignment table with 15 subtasks grouped by category
 * - Model dropdown, cost delta, save/reset
 * - Quick Apply presets with confirmation modal
 * - Confidence model toggle
 * - Cost dashboard
 * - Demo fallback, admin guard, loading, mobile responsive
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockSetModel = vi.fn()
const mockApplyPlan = vi.fn()
const mockSetConfidenceModel = vi.fn()

const DEMO_SUBTASKS = [
  { category: 'news_feed', subtask: 'triage', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 24 },
  { category: 'news_feed', subtask: 'extraction', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'news_feed', subtask: 'classification', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 24 },
  { category: 'news_feed', subtask: 'summarization', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'news_feed', subtask: 'translation', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 24 },
  { category: 'ioc_enrichment', subtask: 'risk_scoring', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'ioc_enrichment', subtask: 'context_generation', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'ioc_enrichment', subtask: 'attribution', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'ioc_enrichment', subtask: 'campaign_linking', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'ioc_enrichment', subtask: 'false_positive', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 24 },
  { category: 'reporting', subtask: 'executive_summary', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'reporting', subtask: 'technical_detail', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'reporting', subtask: 'trend_analysis', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 90 },
  { category: 'reporting', subtask: 'recommendation', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 24 },
  { category: 'reporting', subtask: 'formatting', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 24 },
]

vi.mock('@/hooks/use-global-ai-config', () => ({
  useGlobalAiConfig: vi.fn(() => ({
    config: {
      subtasks: DEMO_SUBTASKS,
      confidenceModel: 'bayesian',
      costEstimate: { totalMonthly: 1020, byCategory: { news_feed: 252, ioc_enrichment: 384, reporting: 384 } },
      activePlan: 'teams',
    },
    isLoading: false,
    isDemo: false,
    setModel: mockSetModel,
    isSavingModel: false,
    applyPlan: mockApplyPlan,
    isApplyingPlan: false,
    confidenceModel: 'bayesian',
    setConfidenceModel: mockSetConfidenceModel,
    isSavingConfidence: false,
    modelCosts: { haiku: 0.80, sonnet: 3.00, opus: 15.00 },
    modelAccuracy: { haiku: 78, sonnet: 92, opus: 97 },
    recommendations: {},
    presets: [
      { id: 'starter', name: 'Starter (Budget)', description: 'All Haiku — lowest cost, good accuracy', tier: 'starter', monthlyCost: 360 },
      { id: 'teams', name: 'Teams (Balanced)', description: 'Recommended mix — best accuracy/cost ratio', tier: 'teams', monthlyCost: 1020 },
      { id: 'enterprise', name: 'Enterprise (Max Accuracy)', description: 'All Sonnet — highest accuracy', tier: 'enterprise', monthlyCost: 1350 },
    ],
  })),
  PLAN_PRESETS: [],
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

import { GlobalAiConfigPage } from '@/pages/GlobalAiConfigPage'
import { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import { useAuthStore } from '@/stores/auth-store'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GlobalAiConfigPage', () => {
  it('renders model assignment table with all 15 subtasks', () => {
    render(<GlobalAiConfigPage />)
    expect(screen.getByTestId('model-table')).toBeInTheDocument()
    // 15 subtask rows
    for (const s of DEMO_SUBTASKS) {
      expect(screen.getByTestId(`subtask-row-${s.category}.${s.subtask}`)).toBeInTheDocument()
    }
  })

  it('groups rows by category (news_feed, ioc_enrichment, reporting)', () => {
    render(<GlobalAiConfigPage />)
    const tableSection = screen.getByTestId('model-table-section')
    expect(tableSection.textContent).toContain('News Feed Processing')
    expect(tableSection.textContent).toContain('IOC Enrichment')
    expect(tableSection.textContent).toContain('Reporting')
  })

  it('model dropdown shows haiku/sonnet/opus options', () => {
    render(<GlobalAiConfigPage />)
    const select = screen.getByTestId('model-select-news_feed.triage') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(3)
    expect(options[0].value).toBe('haiku')
    expect(options[1].value).toBe('sonnet')
    expect(options[2].value).toBe('opus')
  })

  it('changing model shows cost delta inline', () => {
    render(<GlobalAiConfigPage />)
    const select = screen.getByTestId('model-select-news_feed.triage')
    fireEvent.change(select, { target: { value: 'opus' } })
    // Should show cost delta for opus vs haiku recommended
    expect(screen.getByText(/\+\$.*\/mo/)).toBeInTheDocument()
  })

  it('Save Changes button calls API for changed rows only', () => {
    render(<GlobalAiConfigPage />)
    const select = screen.getByTestId('model-select-news_feed.triage')
    fireEvent.change(select, { target: { value: 'sonnet' } })
    const saveBtn = screen.getByTestId('save-changes-btn')
    fireEvent.click(saveBtn)
    expect(mockSetModel).toHaveBeenCalledWith({ category: 'news_feed', subtask: 'triage', model: 'sonnet' })
    expect(mockSetModel).toHaveBeenCalledTimes(1)
  })

  it('Reset to Recommended sets model back to recommended value', () => {
    render(<GlobalAiConfigPage />)
    // Change triage to opus first
    const select = screen.getByTestId('model-select-news_feed.triage')
    fireEvent.change(select, { target: { value: 'opus' } })
    // Reset button should appear
    const resetBtn = screen.getByTestId('reset-news_feed.triage')
    fireEvent.click(resetBtn)
    // After resetting, select should be back to haiku
    expect((select as HTMLSelectElement).value).toBe('haiku')
  })

  it('renders 3 preset cards', () => {
    render(<GlobalAiConfigPage />)
    expect(screen.getByTestId('preset-starter')).toBeInTheDocument()
    expect(screen.getByTestId('preset-teams')).toBeInTheDocument()
    expect(screen.getByTestId('preset-enterprise')).toBeInTheDocument()
  })

  it('clicking preset card shows confirmation modal', () => {
    render(<GlobalAiConfigPage />)
    fireEvent.click(screen.getByTestId('preset-starter'))
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
    expect(screen.getByText('Apply Preset?')).toBeInTheDocument()
  })

  it('confirming preset calls apply-plan API', () => {
    render(<GlobalAiConfigPage />)
    fireEvent.click(screen.getByTestId('preset-enterprise'))
    fireEvent.click(screen.getByTestId('confirm-apply-btn'))
    expect(mockApplyPlan).toHaveBeenCalledWith('enterprise')
  })

  it('active plan card highlighted', () => {
    render(<GlobalAiConfigPage />)
    // activePlan is 'teams' — should have check icon
    const teamsCard = screen.getByTestId('preset-teams')
    expect(teamsCard.querySelector('[data-testid="active-plan-check"]')).toBeInTheDocument()
  })

  it('confidence model toggle renders Linear and Bayesian options', () => {
    render(<GlobalAiConfigPage />)
    expect(screen.getByTestId('confidence-linear')).toBeInTheDocument()
    expect(screen.getByTestId('confidence-bayesian')).toBeInTheDocument()
  })

  it('confidence model Apply button calls API', () => {
    render(<GlobalAiConfigPage />)
    fireEvent.click(screen.getByTestId('confidence-linear'))
    const applyBtn = screen.getByTestId('apply-confidence-btn')
    fireEvent.click(applyBtn)
    expect(mockSetConfidenceModel).toHaveBeenCalledWith('linear')
  })

  it('cost dashboard shows total monthly estimate', () => {
    render(<GlobalAiConfigPage />)
    expect(screen.getByTestId('total-monthly-cost')).toHaveTextContent('$1020.00')
  })

  it('cost breakdown by category rendered', () => {
    render(<GlobalAiConfigPage />)
    expect(screen.getByTestId('cost-category-news_feed')).toBeInTheDocument()
    expect(screen.getByTestId('cost-category-ioc_enrichment')).toBeInTheDocument()
    expect(screen.getByTestId('cost-category-reporting')).toBeInTheDocument()
  })

  it('demo fallback renders when API fails', () => {
    vi.mocked(useGlobalAiConfig).mockReturnValueOnce({
      config: {
        subtasks: DEMO_SUBTASKS,
        confidenceModel: 'bayesian' as const,
        costEstimate: { totalMonthly: 1020, byCategory: {} },
        activePlan: null,
      },
      isLoading: false,
      isDemo: true,
      setModel: mockSetModel,
      isSavingModel: false,
      applyPlan: mockApplyPlan,
      isApplyingPlan: false,
      confidenceModel: 'bayesian' as const,
      setConfidenceModel: mockSetConfidenceModel,
      isSavingConfidence: false,
      modelCosts: { haiku: 0.80, sonnet: 3.00, opus: 15.00 },
      modelAccuracy: { haiku: 78, sonnet: 92, opus: 97 },
      recommendations: {},
      presets: [],
    })
    render(<GlobalAiConfigPage />)
    expect(screen.getByTestId('demo-badge')).toBeInTheDocument()
  })

  it('non-admin sees unauthorized message', () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({
      user: { displayName: 'User', email: 'user@test.com', role: 'analyst' },
      tenant: { name: 'ACME Corp' },
      accessToken: 'mock-token',
    }))
    render(<GlobalAiConfigPage />)
    expect(screen.getByText('Access restricted to super administrators.')).toBeInTheDocument()
    // Restore admin mock for subsequent tests
    vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({
      user: { displayName: 'Admin', email: 'admin@test.com', role: 'super_admin' },
      tenant: { name: 'ACME Corp' },
      accessToken: 'mock-token',
    }))
  })

  it('loading skeleton shown while fetching', () => {
    vi.mocked(useGlobalAiConfig).mockReturnValueOnce({
      config: undefined as any,
      isLoading: true,
      isDemo: false,
      setModel: vi.fn(),
      isSavingModel: false,
      applyPlan: vi.fn(),
      isApplyingPlan: false,
      confidenceModel: 'bayesian' as const,
      setConfidenceModel: vi.fn(),
      isSavingConfidence: false,
      modelCosts: { haiku: 0.80, sonnet: 3.00, opus: 15.00 },
      modelAccuracy: { haiku: 78, sonnet: 92, opus: 97 },
      recommendations: {},
      presets: [],
    })
    render(<GlobalAiConfigPage />)
    const page = screen.getByTestId('global-ai-config-page')
    // Verify loading state: page exists and contains skeleton divs
    expect(page).toBeInTheDocument()
    expect(page.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('mobile responsive: table scrolls horizontally on small screens', () => {
    render(<GlobalAiConfigPage />)
    const scrollContainer = screen.getByTestId('model-table-scroll')
    expect(scrollContainer.classList.contains('overflow-x-auto')).toBe(true)
  })
})
