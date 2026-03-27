import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { EnrichmentSourceWidget } from '@/components/widgets/EnrichmentSourceWidget'

const mockData = {
  avgQuality: 72,
  enrichedCount: 840,
  unenrichedCount: 160,
  enrichedPercent: 84,
  bySource: {
    Shodan: { success: 620, total: 840, rate: 74 },
    GreyNoise: { success: 510, total: 840, rate: 61 },
    EPSS: { success: 380, total: 420, rate: 90 },
    Warninglist: { success: 780, total: 840, rate: 93 },
  },
}

const mockHook = vi.fn()

vi.mock('@/hooks/use-enrichment-data', () => ({
  useEnrichmentSourceBreakdown: () => mockHook(),
}))

describe('EnrichmentSourceWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHook.mockReturnValue({ data: mockData, isDemo: false, isLoading: false })
  })

  it('renders avg quality score', () => {
    render(<EnrichmentSourceWidget />)
    expect(screen.getByTestId('avg-quality')).toHaveTextContent('72')
  })

  it('shows enriched percentage in progress ring', () => {
    render(<EnrichmentSourceWidget />)
    expect(screen.getByTestId('enrichment-source-widget')).toBeInTheDocument()
    expect(screen.getByText(/840 enriched/)).toBeInTheDocument()
  })

  it('renders source breakdown bars for all 4 sources', () => {
    render(<EnrichmentSourceWidget />)
    expect(screen.getByTestId('source-bar-Shodan')).toBeInTheDocument()
    expect(screen.getByTestId('source-bar-GreyNoise')).toBeInTheDocument()
    expect(screen.getByTestId('source-bar-EPSS')).toBeInTheDocument()
    expect(screen.getByTestId('source-bar-Warninglist')).toBeInTheDocument()
  })

  it('shows amber warning when unenriched backlog > 100', () => {
    render(<EnrichmentSourceWidget />)
    expect(screen.getByTestId('unenriched-warning')).toHaveTextContent('160')
  })

  it('hides warning when unenriched backlog <= 100', () => {
    mockHook.mockReturnValue({
      data: { ...mockData, unenrichedCount: 50 },
      isDemo: false, isLoading: false,
    })
    render(<EnrichmentSourceWidget />)
    expect(screen.queryByTestId('unenriched-warning')).not.toBeInTheDocument()
  })

  it('renders demo badge and static data in demo mode', () => {
    mockHook.mockReturnValue({ data: mockData, isDemo: true, isLoading: false })
    render(<EnrichmentSourceWidget />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByTestId('avg-quality')).toHaveTextContent('72')
  })

  it('renders nothing when data is null', () => {
    mockHook.mockReturnValue({ data: null, isDemo: false, isLoading: true })
    render(<EnrichmentSourceWidget />)
    expect(screen.queryByTestId('enrichment-source-widget')).not.toBeInTheDocument()
  })
})
