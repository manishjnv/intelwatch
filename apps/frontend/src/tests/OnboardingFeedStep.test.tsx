import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// ─── Mocks ──────────────────────────────────────────────────────

const mockCompleteStep = { mutate: vi.fn(), isPending: false }
const mockSkipStep = { mutate: vi.fn(), isPending: false }
const mockSeedDemo = { mutate: vi.fn(), isPending: false }

const mockCatalogFeeds = [
  { id: 'f1', name: 'CISA KEV', feedType: 'rest', minPlanTier: 'free', enabled: true, sourceReliability: 'B' },
  { id: 'f2', name: 'NVD CVEs', feedType: 'nvd', minPlanTier: 'free', enabled: true, sourceReliability: 'A' },
  { id: 'f3', name: 'URLhaus', feedType: 'rest', minPlanTier: 'free', enabled: true, sourceReliability: 'C' },
  { id: 'f4', name: 'PhishTank', feedType: 'rest', minPlanTier: 'free', enabled: true, sourceReliability: 'C' },
  { id: 'f5', name: 'Tor Exit Nodes', feedType: 'rest', minPlanTier: 'free', enabled: true, sourceReliability: 'B' },
  { id: 'f6', name: 'AlienVault OTX', feedType: 'rest', minPlanTier: 'starter', enabled: true, sourceReliability: 'B' },
  { id: 'f7', name: 'CIRCL MISP', feedType: 'misp', minPlanTier: 'enterprise', enabled: true, sourceReliability: 'A' },
]

const defaultFeedHookReturn = {
  globalFeeds: mockCatalogFeeds,
  eligibleFeeds: mockCatalogFeeds.filter(f => f.minPlanTier === 'free'),
  lockedFeeds: mockCatalogFeeds.filter(f => f.minPlanTier !== 'free'),
  selectedFeeds: mockCatalogFeeds.slice(0, 5),
  selectedFeedIds: new Set(['f1', 'f2', 'f3', 'f4', 'f5']),
  toggleFeed: vi.fn(),
  selectAll: vi.fn(),
  deselectAll: vi.fn(),
  privateFeeds: [],
  addPrivateFeed: vi.fn(),
  removePrivateFeed: vi.fn(),
  testFeed: vi.fn().mockResolvedValue({ valid: true, feedTitle: 'Test', articleCount: 10, responseTimeMs: 200 }),
  alertConfig: { minSeverity: 'high', minConfidence: 60, iocTypes: ['ip', 'domain', 'hash', 'cve', 'url', 'email'] },
  setAlertConfig: vi.fn(),
  maxGlobal: 5,
  maxPrivate: 3,
  isLoading: false,
}

const mockUseOnboardingWizard = vi.fn()
const mockUseOnboardingFeeds = vi.fn(() => defaultFeedHookReturn)

vi.mock('@/hooks/use-phase6-data', () => ({
  useOnboardingWizard: (...args: unknown[]) => mockUseOnboardingWizard(...args),
  useWelcomeDashboard: vi.fn(() => ({ data: null, isDemo: true })),
  usePipelineHealth: vi.fn(() => ({ data: null })),
  useModuleReadiness: vi.fn(() => ({ data: [] })),
  useReadinessCheck: vi.fn(() => ({ data: null })),
  useCompleteStep: vi.fn(() => mockCompleteStep),
  useSkipStep: vi.fn(() => mockSkipStep),
  useSeedDemo: vi.fn(() => mockSeedDemo),
}))

vi.mock('@/hooks/use-onboarding-feeds', () => ({
  useOnboardingFeeds: (...args: unknown[]) => mockUseOnboardingFeeds(...args),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="stats-bar"><span>{title}</span>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{value}</span>
  ),
}))

// ─── Wizard States ──────────────────────────────────────────────

const mockWizardFeedStep = {
  id: 'w1',
  currentStep: 'feed_activation',
  steps: { welcome: 'completed', org_profile: 'completed', team_invite: 'skipped',
    feed_activation: 'in_progress', integration_setup: 'pending',
    dashboard_config: 'pending', readiness_check: 'pending', launch: 'pending' },
  completionPercent: 37,
  orgProfile: null, teamInvites: [], dataSources: [], dashboardPrefs: null,
  startedAt: '2026-01-01', updatedAt: '2026-01-01', completedAt: null,
}

const mockWizardWelcomeStep = {
  ...mockWizardFeedStep,
  currentStep: 'welcome',
  steps: { ...mockWizardFeedStep.steps, welcome: 'in_progress', org_profile: 'pending', team_invite: 'pending', feed_activation: 'pending' },
  completionPercent: 0,
}

// ─── Helpers ────────────────────────────────────────────────────

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
  )
}

async function importAndRender() {
  const { OnboardingPage } = await import('@/pages/OnboardingPage')
  return wrap(<OnboardingPage />)
}

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockUseOnboardingFeeds.mockReturnValue(defaultFeedHookReturn)
})

describe('Onboarding Feed Selection Step', () => {
  it('renders global feed grid when wizard is at feed_activation step', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    expect(screen.getByText('Global Feeds')).toBeInTheDocument()
    expect(screen.getByTestId('global-feed-grid')).toBeInTheDocument()
  })

  it('pre-selects 5 feeds for free tier', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    expect(screen.getByText('5/5 selected')).toBeInTheDocument()
  })

  it('shows all eligible feeds plus locked feeds with Upgrade badge', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
    expect(screen.getByText('NVD CVEs')).toBeInTheDocument()
    const upgradeBadges = screen.getAllByText('Upgrade')
    expect(upgradeBadges.length).toBe(2)
  })

  it('does not show feed selection when wizard is NOT at feed_activation step', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardWelcomeStep, isDemo: false })
    await importAndRender()
    expect(screen.queryByText('Global Feeds')).not.toBeInTheDocument()
    expect(screen.getByText('Complete Step')).toBeInTheDocument()
  })

  it('shows Add Your Own Feed button', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    expect(screen.getByText('Add Your Own Feed')).toBeInTheDocument()
  })

  it('shows add feed form when button clicked', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    fireEvent.click(screen.getByText('Add Your Own Feed'))
    expect(screen.getByTestId('add-feed-form')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Feed name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Feed URL')).toBeInTheDocument()
  })

  it('Test Feed button calls testFeed', async () => {
    const mockTestFeed = vi.fn().mockResolvedValue({ valid: true, feedTitle: 'OK', articleCount: 5, responseTimeMs: 100 })
    mockUseOnboardingFeeds.mockReturnValue({ ...defaultFeedHookReturn, testFeed: mockTestFeed })
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    fireEvent.click(screen.getByText('Add Your Own Feed'))
    fireEvent.change(screen.getByPlaceholderText('Feed URL'), { target: { value: 'https://example.com/feed.rss' } })
    fireEvent.click(screen.getByTestId('test-feed-btn'))
    await waitFor(() => {
      expect(mockTestFeed).toHaveBeenCalledWith('https://example.com/feed.rss', 'rss')
    })
  })

  it('severity dropdown renders with options', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    const select = screen.getByTestId('severity-select')
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('high')
  })

  it('confidence slider renders with default value', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    const slider = screen.getByTestId('confidence-slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveValue('60')
  })

  it('Continue button calls completeStep for feed_activation', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    fireEvent.click(screen.getByText('Continue'))
    expect(mockCompleteStep.mutate).toHaveBeenCalledWith({ step: 'feed_activation' })
  })

  it('Skip button calls skipStep for feed_activation', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    fireEvent.click(screen.getByText(/Skip.*Use Defaults/))
    expect(mockSkipStep.mutate).toHaveBeenCalledWith({ step: 'feed_activation' })
  })

  it('shows Select All / Deselect All toggles', async () => {
    mockUseOnboardingWizard.mockReturnValue({ data: mockWizardFeedStep, isDemo: false })
    await importAndRender()
    expect(screen.getByText('Select All')).toBeInTheDocument()
    expect(screen.getByText('Deselect All')).toBeInTheDocument()
  })
})
