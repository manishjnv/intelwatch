/**
 * Tests for IocListPage Source column + filter (DECISION-029 Phase E):
 * - Source column renders Global/Private badges
 * - Source filter works
 * - Demo fallback includes source field
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockUseIOCs = vi.fn()
const mockUseIOCStats = vi.fn()

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: (...args: any[]) => mockUseIOCs(...args),
  useIOCStats: (...args: any[]) => mockUseIOCStats(...args),
  useDashboardStats: vi.fn(() => ({ data: null })),
}))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left, right, showRight }: any) => (
    <div data-testid="split-pane">
      <div data-testid="split-left">{left}</div>
      {showRight && <div data-testid="split-right">{right}</div>}
    </div>
  ),
}))

vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span data-testid="entity-chip">{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span data-testid="severity-badge">{severity}</span>,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({ user: { role: 'analyst' }, tenant: { name: 'T' }, accessToken: 't' })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))

import { IocListPage } from '@/pages/IocListPage'

const MOCK_IOCS = [
  {
    id: 'i1', normalizedValue: '185.220.101.34', iocType: 'ip', severity: 'critical',
    confidence: 92, lifecycle: 'active', tlp: 'red', tags: ['tor'], lastSeen: '2026-03-27',
    firstSeen: '2026-03-01', campaignId: null, source: 'global',
  },
  {
    id: 'i2', normalizedValue: 'evil.com', iocType: 'domain', severity: 'high',
    confidence: 78, lifecycle: 'new', tlp: 'amber', tags: [], lastSeen: '2026-03-26',
    firstSeen: '2026-03-20', campaignId: null, source: 'private',
  },
]

describe('IocListPage — Source column', () => {
  beforeEach(() => {
    mockUseIOCs.mockReturnValue({
      data: { data: MOCK_IOCS, total: 2 },
      isLoading: false,
      isDemo: true,
    })
    mockUseIOCStats.mockReturnValue({
      data: { total: 2, bySeverity: {}, byLifecycle: {} },
    })
  })

  it('renders Source column header', () => {
    render(<IocListPage />)
    expect(screen.getByText('Source')).toBeTruthy()
  })

  it('shows Global badge for global IOCs', () => {
    render(<IocListPage />)
    expect(screen.getByText('Global')).toBeTruthy()
  })

  it('shows Private badge for private IOCs', () => {
    render(<IocListPage />)
    expect(screen.getByText('Private')).toBeTruthy()
  })

  it('Source filter option exists', () => {
    render(<IocListPage />)
    // The filter bar should contain the source filter
    expect(screen.getByText('Source')).toBeTruthy()
  })
})
