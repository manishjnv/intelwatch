/**
 * @module __tests__/settings-tab.test
 * @description Tests for SettingsTab — super-admin (provider keys, models,
 * merged confidence & preferences, security) and tenant (org profile,
 * quality, sensitivity, notifications, onboarding, upgrade).
 *
 * S123b: Confidence Model + Platform Preferences merged into single
 * "Confidence & Preferences" section with widget cards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { SettingsTab } from '@/components/command-center/SettingsTab'

// ─── Mock auth store ───────────────────────────────────────────

let mockRole = 'super_admin'
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({
    user: { id: 'u1', email: 'a@test.com', displayName: 'Admin', role: mockRole, tenantId: 't1', avatarUrl: null },
    accessToken: 'tok', tenant: { id: 't1', name: 'Test', slug: 'test', plan: 'teams' },
  }),
}))

// ─── Mock data ────────────────────────────────────────────────

const baseMockCC = {
  isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
  globalStats: { totalCostUsd: 100, totalItems: 5000, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
  tenantStats: { tenantId: 't1', itemsConsumed: 1000, attributedCostUsd: 10, costByProvider: {}, costByItemType: {}, consumptionTrend: [], budgetUsedPercent: 50, budgetLimitUsd: 20 },
  tenantList: [],
  queueStats: { pendingItems: 0, processingRate: 0, stuckItems: 0, oldestAge: '< 1m', bySubtask: {} },
  providerKeys: [
    { provider: 'anthropic', keyMasked: 'sk-ant-***', isValid: true, lastTested: null, updatedAt: null },
    { provider: 'openai', keyMasked: null, isValid: false, lastTested: null, updatedAt: null },
    { provider: 'google', keyMasked: null, isValid: false, lastTested: null, updatedAt: null },
  ],
  isLoading: false, isDemo: false, period: 'month' as const,
  setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
  setProviderKey: vi.fn(), isSettingKey: false,
  testProviderKey: vi.fn().mockResolvedValue({ success: true }),
  isTestingKey: false,
  removeProviderKey: vi.fn(), isRemovingKey: false,
}

const baseMockAiConfig = {
  config: {
    subtasks: [
      { category: 'news_feed', subtask: 'triage', model: 'haiku' as const, recommended: 'haiku' as const, accuracyPct: 78, monthlyCostEstimate: 4 },
      { category: 'news_feed', subtask: 'extraction', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 92, monthlyCostEstimate: 15 },
      { category: 'ioc_enrichment', subtask: 'risk_scoring', model: 'sonnet' as const, recommended: 'sonnet' as const, accuracyPct: 94, monthlyCostEstimate: 12 },
    ],
    confidenceModel: 'bayesian' as const,
    costEstimate: { totalMonthly: 19, byCategory: {} },
    activePlan: null,
  },
  isLoading: false, error: null, isDemo: true,
  setModel: vi.fn(), isSavingModel: false,
  applyPlan: vi.fn(), isApplyingPlan: false,
  confidenceModel: 'bayesian' as const,
  setConfidenceModel: vi.fn(), isSavingConfidence: false,
  recommendations: {}, modelCosts: {}, modelAccuracy: {}, presets: [],
}

describe('SettingsTab — Super Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    baseMockCC.isSuperAdmin = true
    baseMockCC.tenantPlan = 'teams'
  })

  it('renders admin view with section pills', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('settings-tab-admin')).toBeInTheDocument()
    expect(screen.getByTestId('admin-section-pills')).toBeInTheDocument()
  })

  it('shows provider keys section by default', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('section-providers-content')).toBeInTheDocument()
    expect(screen.getByTestId('provider-card-anthropic')).toBeInTheDocument()
  })

  it('switches to models section (excludes news_feed)', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    fireEvent.click(screen.getByTestId('section-models'))
    expect(screen.getByTestId('section-models-content')).toBeInTheDocument()
    expect(screen.getByTestId('model-assignments-table')).toBeInTheDocument()
    // news_feed subtasks moved to SystemTab Feed Config — should NOT appear here
    expect(screen.queryByTestId('model-select-triage')).not.toBeInTheDocument()
    // ioc_enrichment should still be present
    expect(screen.getByTestId('model-select-risk_scoring')).toBeInTheDocument()
  })

  it('switches to merged preferences section with both confidence and platform cards', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    fireEvent.click(screen.getByTestId('section-preferences'))
    // Both widget cards present in merged section
    expect(screen.getByTestId('section-preferences-content')).toBeInTheDocument()
    expect(screen.getByTestId('section-confidence-content')).toBeInTheDocument()
    expect(screen.getByTestId('section-platform-content')).toBeInTheDocument()
    // Confidence model buttons
    expect(screen.getByTestId('confidence-linear')).toBeInTheDocument()
    expect(screen.getByTestId('confidence-bayesian')).toBeInTheDocument()
    // Platform preference controls
    expect(screen.getByTestId('default-sensitivity-balanced')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-over-limit')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-provider-error')).toBeInTheDocument()
  })

  it('renders 3 provider cards', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('provider-card-anthropic')).toBeInTheDocument()
    expect(screen.getByTestId('provider-card-openai')).toBeInTheDocument()
    expect(screen.getByTestId('provider-card-google')).toBeInTheDocument()
  })

  it('has 4 section pills (providers, models, preferences, security)', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('section-providers')).toBeInTheDocument()
    expect(screen.getByTestId('section-models')).toBeInTheDocument()
    expect(screen.getByTestId('section-preferences')).toBeInTheDocument()
    expect(screen.getByTestId('section-security')).toBeInTheDocument()
    // Old separate pills should not exist
    expect(screen.queryByTestId('section-confidence')).not.toBeInTheDocument()
    expect(screen.queryByTestId('section-platform')).not.toBeInTheDocument()
  })
})

describe('SettingsTab — Tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    baseMockCC.isSuperAdmin = false
    baseMockCC.tenantPlan = 'teams'
  })

  it('renders tenant view', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('settings-tab-tenant')).toBeInTheDocument()
  })

  it('shows org profile section with industry select', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('org-profile-section')).toBeInTheDocument()
    expect(screen.getByTestId('industry-select')).toBeInTheDocument()
  })

  it('can change industry', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    const select = screen.getByTestId('industry-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Finance' } })
    expect(select.value).toBe('Finance')
  })

  it('shows tech stack chips', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('tech-os-windows')).toBeInTheDocument()
    expect(screen.getByTestId('tech-os-linux')).toBeInTheDocument()
  })

  it('can toggle tech stack chip', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    const chip = screen.getByTestId('tech-os-macos')
    fireEvent.click(chip)
    expect(chip.className).toContain('accent')
  })

  it('shows business risk checkboxes', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('risk-DataBreach')).toBeInTheDocument()
    expect(screen.getByTestId('risk-Ransomware')).toBeInTheDocument()
  })

  it('shows org size radio buttons', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('size-startup')).toBeInTheDocument()
    expect(screen.getByTestId('size-smb')).toBeInTheDocument()
    expect(screen.getByTestId('size-enterprise')).toBeInTheDocument()
  })

  it('shows geography inputs', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('geography-country')).toBeInTheDocument()
    expect(screen.getByTestId('geography-region')).toBeInTheDocument()
  })

  it('shows intelligence quality section', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('intelligence-quality-section')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
  })

  it('shows alert sensitivity options', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('alert-sensitivity-section')).toBeInTheDocument()
    expect(screen.getByTestId('sensitivity-low')).toBeInTheDocument()
    expect(screen.getByTestId('sensitivity-balanced')).toBeInTheDocument()
    expect(screen.getByTestId('sensitivity-aggressive')).toBeInTheDocument()
  })

  it('can change alert sensitivity', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    fireEvent.click(screen.getByTestId('sensitivity-aggressive'))
    expect(screen.getByTestId('sensitivity-aggressive').className).toContain('border-brand')
  })

  it('shows notifications section', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('notifications-section')).toBeInTheDocument()
    expect(screen.getByTestId('digest-daily')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-realtime')).toBeInTheDocument()
  })

  it('shows onboarding checklist', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('onboarding-section')).toBeInTheDocument()
    expect(screen.getByText('Complete org profile')).toBeInTheDocument()
    expect(screen.getByText('Add first feed')).toBeInTheDocument()
    expect(screen.getByTestId('resume-wizard-btn')).toBeInTheDocument()
  })

  it('does NOT show upgrade CTA for paid plan', () => {
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.queryByTestId('upgrade-cta-section')).not.toBeInTheDocument()
  })

  it('shows upgrade CTA for free plan', () => {
    baseMockCC.tenantPlan = 'free'
    render(<SettingsTab data={baseMockCC as any} aiConfig={baseMockAiConfig as any} />)
    expect(screen.getByTestId('upgrade-cta-section')).toBeInTheDocument()
    expect(screen.getByTestId('plan-comparison-table')).toBeInTheDocument()
    expect(screen.getByTestId('upgrade-btn')).toBeInTheDocument()
  })
})
