import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { AiCostWidget } from '@/components/widgets/AiCostWidget'

const mockData = {
  totalCost30d: 12.50,
  previousCost30d: 14.20,
  deltaPercent: -12,
  budgetMonthly: 50.00,
  budgetUtilization: 25,
  byModel: { Haiku: 3.20, Sonnet: 9.30 },
  costPerArticle: 0.02,
  costPerIoc: 0.04,
}

const mockHook = vi.fn()

vi.mock('@/hooks/use-enrichment-data', () => ({
  useAiCostSummary: () => mockHook(),
}))

describe('AiCostWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHook.mockReturnValue({ data: mockData, isDemo: false, isLoading: false })
  })

  it('renders total 30-day cost', () => {
    render(<AiCostWidget />)
    expect(screen.getByTestId('total-cost')).toHaveTextContent('$12.50')
  })

  it('shows delta badge with correct direction (negative = green)', () => {
    render(<AiCostWidget />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveTextContent('-12%')
    expect(badge.className).toContain('text-sev-low')
  })

  it('shows delta badge red when positive', () => {
    mockHook.mockReturnValue({
      data: { ...mockData, deltaPercent: 15 },
      isDemo: false, isLoading: false,
    })
    render(<AiCostWidget />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveTextContent('+15%')
    expect(badge.className).toContain('text-sev-high')
  })

  it('budget gauge green when under 70%', () => {
    render(<AiCostWidget />)
    const gauge = screen.getByTestId('budget-gauge')
    expect(gauge.className).toContain('bg-sev-low')
  })

  it('budget gauge amber when 70-90%', () => {
    mockHook.mockReturnValue({
      data: { ...mockData, budgetUtilization: 80 },
      isDemo: false, isLoading: false,
    })
    render(<AiCostWidget />)
    const gauge = screen.getByTestId('budget-gauge')
    expect(gauge.className).toContain('bg-sev-medium')
  })

  it('budget gauge red when over 90%', () => {
    mockHook.mockReturnValue({
      data: { ...mockData, budgetUtilization: 95 },
      isDemo: false, isLoading: false,
    })
    render(<AiCostWidget />)
    const gauge = screen.getByTestId('budget-gauge')
    expect(gauge.className).toContain('bg-sev-critical')
  })

  it('renders model breakdown with haiku + sonnet amounts', () => {
    render(<AiCostWidget />)
    expect(screen.getByText(/Haiku/)).toBeInTheDocument()
    expect(screen.getByText('$3.20')).toBeInTheDocument()
    expect(screen.getByText(/Sonnet/)).toBeInTheDocument()
    expect(screen.getByText('$9.30')).toBeInTheDocument()
  })

  it('renders per-unit costs', () => {
    render(<AiCostWidget />)
    expect(screen.getByText('$0.02')).toBeInTheDocument()
    expect(screen.getByText('$0.04')).toBeInTheDocument()
  })

  it('demo fallback renders static data with demo badge', () => {
    mockHook.mockReturnValue({ data: mockData, isDemo: true, isLoading: false })
    render(<AiCostWidget />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByTestId('total-cost')).toHaveTextContent('$12.50')
  })

  it('renders nothing when data is null', () => {
    mockHook.mockReturnValue({ data: null, isDemo: false, isLoading: true })
    render(<AiCostWidget />)
    expect(screen.queryByTestId('ai-cost-widget')).not.toBeInTheDocument()
  })
})
