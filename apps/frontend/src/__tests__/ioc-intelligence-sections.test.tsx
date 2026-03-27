import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CorroborationSection, SeverityVotesSection, CommunityFpSection } from '@/components/IocIntelligenceSections'

// ── Mock stores (required by test-utils) ────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({ user: { role: 'analyst' }, tenant: { name: 'T' }, accessToken: 't' })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))
vi.mock('@/hooks/use-intel-data', () => ({ useDashboardStats: vi.fn(() => ({ data: null })) }))

// ── Mock hooks ──────────────────────────────────────────────

const mockCorroboration = {
  score: 82, sourceCount: 4, weightedSourceCount: 3.2, independenceScore: 75,
  consensusSeverity: 'high', tier: 'high' as const, narrative: '4 source(s), 2 highly reliable (A/B). Independence: 75%. Last seen: 2h ago.',
  sources: [
    { feedId: 'f1', feedName: 'AlienVault OTX', admiraltySource: 'A', firstSeenByFeed: '2026-03-01', lastSeenByFeed: '2026-03-27' },
    { feedId: 'f2', feedName: 'Abuse.ch', admiraltySource: 'B', firstSeenByFeed: '2026-03-05', lastSeenByFeed: '2026-03-27' },
  ],
}

const mockVotes = {
  currentSeverity: 'critical', totalVotes: 3,
  voteBreakdown: {
    critical: { weight: 15, voterCount: 1 },
    high: { weight: 8, voterCount: 2 },
  },
  confidence: 65, margin: 7,
}

const mockFpSummary = {
  fpCount: 2, fpRate: 50, totalTenants: 4,
  reports: [
    { tenantId: 't1', reason: 'benign_service', reportedAt: '2026-03-20T00:00:00Z' },
    { tenantId: 't2', reason: 'test_data', reportedAt: '2026-03-21T00:00:00Z' },
  ],
  autoAction: 'downgraded' as const,
}

const mockReportFp = vi.fn()
const mockWithdrawFp = vi.fn()

vi.mock('@/hooks/use-global-iocs', () => ({
  useCorroborationDetail: vi.fn(() => ({ data: mockCorroboration })),
  useSeverityVotes: vi.fn(() => ({ data: mockVotes })),
  useFpSummary: vi.fn(() => ({ data: mockFpSummary })),
  useFpActions: vi.fn(() => ({ reportFp: mockReportFp, withdrawFp: mockWithdrawFp, isReporting: false })),
}))

describe('CorroborationSection', () => {
  it('renders score and tier badge', () => {
    render(<CorroborationSection iocId="ioc-1" />)
    expect(screen.getByText('82')).toBeTruthy()
    const tier = screen.getByTestId('corroboration-tier')
    expect(tier.textContent).toBe('high')
  })

  it('confirmed shows green badge', async () => {
    const { useCorroborationDetail } = await import('@/hooks/use-global-iocs') as any
    useCorroborationDetail.mockReturnValue({ data: { ...mockCorroboration, tier: 'confirmed', score: 92 } })
    render(<CorroborationSection iocId="ioc-1" />)
    const tier = screen.getByTestId('corroboration-tier')
    expect(tier.textContent).toBe('confirmed')
    expect(tier.className).toContain('sev-low') // green
  })

  it('source list shows feed names', () => {
    const { useCorroborationDetail } = require('@/hooks/use-global-iocs')
    useCorroborationDetail.mockReturnValue({ data: mockCorroboration })
    render(<CorroborationSection iocId="ioc-1" />)
    expect(screen.getByText('AlienVault OTX')).toBeTruthy()
    expect(screen.getByText('Abuse.ch')).toBeTruthy()
  })

  it('narrative text rendered', () => {
    render(<CorroborationSection iocId="ioc-1" />)
    const narrative = screen.getByTestId('corroboration-narrative')
    expect(narrative.textContent).toContain('4 source(s)')
    expect(narrative.textContent).toContain('highly reliable')
  })
})

describe('SeverityVotesSection', () => {
  it('stacked bar renders', () => {
    const { useSeverityVotes } = require('@/hooks/use-global-iocs')
    useSeverityVotes.mockReturnValue({ data: mockVotes })
    render(<SeverityVotesSection iocId="ioc-1" />)
    expect(screen.getByTestId('vote-bar')).toBeTruthy()
  })

  it('Contested shown when margin low', () => {
    const { useSeverityVotes } = require('@/hooks/use-global-iocs')
    useSeverityVotes.mockReturnValue({ data: { ...mockVotes, margin: 2 } })
    render(<SeverityVotesSection iocId="ioc-1" />)
    const label = screen.getByTestId('consensus-label')
    expect(label.textContent).toBe('Contested')
  })

  it('Clear consensus shown when margin high', () => {
    const { useSeverityVotes } = require('@/hooks/use-global-iocs')
    useSeverityVotes.mockReturnValue({ data: { ...mockVotes, margin: 15 } })
    render(<SeverityVotesSection iocId="ioc-1" />)
    const label = screen.getByTestId('consensus-label')
    expect(label.textContent).toBe('Clear consensus')
  })
})

describe('CommunityFpSection', () => {
  it('renders FP rate and count', () => {
    const { useFpSummary } = require('@/hooks/use-global-iocs')
    useFpSummary.mockReturnValue({ data: mockFpSummary })
    render(<CommunityFpSection iocId="ioc-1" />)
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('auto-downgrade banner shown when fpRate > 50%', () => {
    render(<CommunityFpSection iocId="ioc-1" />)
    const banner = screen.getByTestId('fp-auto-banner')
    expect(banner.textContent).toContain('Auto-downgraded')
  })

  it('Report False Positive button visible', () => {
    render(<CommunityFpSection iocId="ioc-1" />)
    expect(screen.getByTestId('report-fp-btn')).toBeTruthy()
  })

  it('clicking Report FP shows form', () => {
    render(<CommunityFpSection iocId="ioc-1" />)
    fireEvent.click(screen.getByTestId('report-fp-btn'))
    expect(screen.getByTestId('fp-reason')).toBeTruthy()
    expect(screen.getByTestId('fp-notes')).toBeTruthy()
  })

  it('submit calls reportFp', () => {
    render(<CommunityFpSection iocId="ioc-1" />)
    fireEvent.click(screen.getByTestId('report-fp-btn'))
    fireEvent.click(screen.getByTestId('submit-fp'))
    expect(mockReportFp).toHaveBeenCalledWith({ reason: 'benign_service', notes: undefined })
  })
})
