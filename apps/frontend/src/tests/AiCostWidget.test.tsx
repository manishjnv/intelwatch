import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { AiCostWidget } from '@/components/widgets/AiCostWidget'

const mockData = {
  totalCostUsd: 12.50,
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
    mockHook.mockReturnValue({ data: mockData, isLoading: false, isError: false })
  })

  it('renders total cost', () => {
    render(<AiCostWidget />)
    expect(screen.getByTestId('total-cost')).toHaveTextContent('$12.50')
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

  it('never renders a Demo pill', () => {
    render(<AiCostWidget />)
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('shows "—" and no model breakdown while loading (no demo data, honest state)', () => {
    mockHook.mockReturnValue({ data: null, isLoading: true, isError: false })
    render(<AiCostWidget />)
    expect(screen.getByTestId('ai-cost-widget')).toBeInTheDocument()
    expect(screen.getByTestId('total-cost')).toHaveTextContent('—')
    expect(screen.queryByText(/Haiku/)).not.toBeInTheDocument()
  })

  it('shows "—" and a failure note on error (no demo data)', () => {
    mockHook.mockReturnValue({ data: null, isLoading: false, isError: true })
    render(<AiCostWidget />)
    expect(screen.getByTestId('total-cost')).toHaveTextContent('—')
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows an honest empty state when data is null but the query succeeded', () => {
    mockHook.mockReturnValue({ data: null, isLoading: false, isError: false })
    render(<AiCostWidget />)
    expect(screen.getByText('No cost data yet')).toBeInTheDocument()
  })
})
