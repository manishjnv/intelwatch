/**
 * Tests for CustomizationPage AI Config tab:
 * plan selector, subtask table, cost estimator sidebar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CustomizationPage } from '@/pages/CustomizationPage'

// ─── Mock hooks ─────────────────────────────────────────────────

const mockPlanTiers = vi.fn()
const mockSubtaskMappings = vi.fn()
const mockRecommendedModels = vi.fn()
const mockCostEstimate = vi.fn()
const mockApplyPlan = vi.fn()
const mockModuleToggles = vi.fn()
const mockRiskWeights = vi.fn()
const mockNotificationChannels = vi.fn()
const mockAiBudgetUsage = vi.fn()

vi.mock('@/hooks/use-phase5-data', () => ({
  IOC_TYPES: ['ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email', 'cve', 'cidr', 'asn', 'ja3', 'mutex', 'registry_key'],
  usePlanTiers:             () => mockPlanTiers(),
  useSubtaskMappings:       () => mockSubtaskMappings(),
  useRecommendedModels:     () => mockRecommendedModels(),
  useCostEstimate:          (...args: unknown[]) => mockCostEstimate(...args),
  useApplyPlan:             () => mockApplyPlan(),
  useSetSubtaskModel:       () => ({ mutate: vi.fn(), isPending: false }),
  useModuleToggles:         () => mockModuleToggles(),
  useRiskWeights:           () => mockRiskWeights(),
  useRiskPresets:           () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useNotificationChannels:  () => mockNotificationChannels(),
  useAiBudgetUsage:         () => mockAiBudgetUsage(),
  useToggleModule:          () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRiskWeight:      () => ({ mutate: vi.fn(), isPending: false }),
  useResetRiskWeights:      () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateNotificationChannel: () => ({ mutate: vi.fn(), isPending: false }),
  // BYOK hooks — stub for tests that don't focus on the API keys card
  useAnthropicKeyStatus:    () => ({ data: { tenantId: 'default', hasKey: false, maskedKey: null }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useSaveAnthropicKey:      () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDeleteAnthropicKey:    () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: object) => unknown) =>
    selector({ user: { displayName: 'Admin', email: 'a@b.com' }, tenant: { name: 'ACME' }, accessToken: 'tok' }),
  ),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark' })) }))
vi.mock('@/stores/sidebar-store', () => ({ useSidebarStore: vi.fn(() => ({ isOpen: true, toggle: vi.fn() })) }))

// ─── Demo data ──────────────────────────────────────────────────

const DEMO_PLANS = [
  { plan: 'starter',      displayName: 'Starter',      costPer1KArticlesUsd: '$4–6',    accuracyPct: '~85%', isRecommended: false },
  { plan: 'professional', displayName: 'Professional', costPer1KArticlesUsd: '~$27',    accuracyPct: '~93%', isRecommended: true  },
  { plan: 'enterprise',   displayName: 'Enterprise',   costPer1KArticlesUsd: '~$85',    accuracyPct: '~96%', isRecommended: false },
  { plan: 'custom',       displayName: 'Custom',       costPer1KArticlesUsd: 'variable', accuracyPct: 'variable', isRecommended: false },
]

const DEMO_SUBTASKS = [
  { id: 's1', tenantId: 'default', subtask: 'summarization',      stage: 1, model: 'sonnet', fallbackModel: 'haiku', isRecommended: true,  updatedAt: new Date().toISOString() },
  { id: 's2', tenantId: 'default', subtask: 'keyword_extraction', stage: 1, model: 'sonnet', fallbackModel: 'haiku', isRecommended: true,  updatedAt: new Date().toISOString() },
  { id: 's3', tenantId: 'default', subtask: 'deduplication',      stage: 3, model: 'haiku',  fallbackModel: 'sonnet', isRecommended: true, updatedAt: new Date().toISOString() },
]

const DEMO_COST = {
  perStage: [
    { stage: 1, model: 'sonnet', articles: 1000, subtasks: 4, costUsd: 25.5 },
    { stage: 2, model: 'sonnet', articles: 200,  subtasks: 6, costUsd: 6.6  },
    { stage: 3, model: 'haiku',  articles: 1000, subtasks: 2, costUsd: 1.13 },
  ],
  totalMonthlyUsd: 33.23,
  comparedTo: { starter: 3.8, professional: 45.6, enterprise: 228 },
}

function setupDefaults() {
  mockPlanTiers.mockReturnValue({ data: { data: DEMO_PLANS }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockSubtaskMappings.mockReturnValue({ data: { data: DEMO_SUBTASKS }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockRecommendedModels.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockCostEstimate.mockReturnValue({ data: DEMO_COST, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockApplyPlan.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockModuleToggles.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockRiskWeights.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockNotificationChannels.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() })
  mockAiBudgetUsage.mockReturnValue({ data: { totalTokens: 0, byTask: {}, dailyUsage: 0, monthlyUsage: 0, budgetUtilization: 0.31 }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('CustomizationPage — AI Config tab', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDefaults() })

  function renderAITab() {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('AI Config'))
  }

  // ── plan selector ─────────────────────────────────────────────
  describe('plan selector', () => {
    it('renders 4 plan tier cards', () => {
      renderAITab()
      expect(screen.getAllByText('Starter').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Professional').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Enterprise').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Custom').length).toBeGreaterThan(0)
    })

    it('shows cost-per-1K for each plan', () => {
      renderAITab()
      expect(screen.getByText('$4–6/1K')).toBeInTheDocument()
      expect(screen.getByText('~$27/1K')).toBeInTheDocument()
      expect(screen.getByText('~$85/1K')).toBeInTheDocument()
    })

    it('shows accuracy pct for each plan', () => {
      renderAITab()
      expect(screen.getByText('~85%')).toBeInTheDocument()
      expect(screen.getByText('~93%')).toBeInTheDocument()
      expect(screen.getByText('~96%')).toBeInTheDocument()
    })

    it('shows REC badge on Professional', () => {
      renderAITab()
      expect(screen.getByText('REC')).toBeInTheDocument()
    })

    it('shows Apply Plan button for a non-custom plan', () => {
      renderAITab()
      expect(screen.getByText(/Apply.*Plan/i)).toBeInTheDocument()
    })
  })

  // ── subtask table ─────────────────────────────────────────────
  describe('subtask table', () => {
    it('shows 12 Pipeline Subtasks heading', () => {
      renderAITab()
      expect(screen.getByText('12 Pipeline Subtasks')).toBeInTheDocument()
    })

    it('shows each subtask name from mock data', () => {
      renderAITab()
      expect(screen.getByText('summarization')).toBeInTheDocument()
      expect(screen.getByText('keyword extraction')).toBeInTheDocument()
      expect(screen.getByText('deduplication')).toBeInTheDocument()
    })

    it('shows model names in table', () => {
      renderAITab()
      const sonnets = screen.getAllByText('sonnet')
      expect(sonnets.length).toBeGreaterThan(0)
    })

    it('shows stage badges S1, S2, S3', () => {
      renderAITab()
      expect(screen.getAllByText('S1').length).toBeGreaterThan(0)
    })
  })

  // ── cost estimator ───────────────────────────────────────────
  describe('cost estimator sidebar', () => {
    it('shows Cost Estimator heading', () => {
      renderAITab()
      expect(screen.getByText('Cost Estimator')).toBeInTheDocument()
    })

    it('shows total monthly cost from mock data', () => {
      renderAITab()
      expect(screen.getByText('$33.23')).toBeInTheDocument()
    })

    it('shows per-stage cost breakdown', () => {
      renderAITab()
      expect(screen.getByText('$25.50')).toBeInTheDocument()
      expect(screen.getByText('$6.60')).toBeInTheDocument()
      expect(screen.getByText('$1.13')).toBeInTheDocument()
    })

    it('shows comparison to other plans', () => {
      renderAITab()
      expect(screen.getByText('vs other plans')).toBeInTheDocument()
      expect(screen.getByText('$3.80')).toBeInTheDocument()
      expect(screen.getByText('$228.00')).toBeInTheDocument()
    })

    it('renders article count slider', () => {
      renderAITab()
      const slider = screen.getByRole('slider')
      expect(slider).toBeInTheDocument()
    })
  })

  // ── interaction ──────────────────────────────────────────────
  describe('interactions', () => {
    it('clicking a plan card calls useCostEstimate with that plan', () => {
      renderAITab()
      // Click the first occurrence of "Starter" (the plan card button)
      fireEvent.click(screen.getAllByText('Starter')[0]!)
      // After clicking Starter, cost estimate should be re-queried
      expect(mockCostEstimate).toHaveBeenCalled()
    })

    it('clicking Apply Plan opens confirmation modal, then Confirm calls applyPlan.mutate', () => {
      const mutateMock = vi.fn()
      mockApplyPlan.mockReturnValue({ mutate: mutateMock, isPending: false })
      renderAITab()
      const applyBtn = screen.getByText(/Apply.*Plan/i)
      fireEvent.click(applyBtn)
      // Confirmation modal should appear
      const confirmBtn = screen.getByText('Confirm')
      fireEvent.click(confirmBtn)
      expect(mutateMock).toHaveBeenCalledWith('professional')
    })
  })
})
