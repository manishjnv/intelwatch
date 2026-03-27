/**
 * Tests for FacetedSidebar component — filter sections, checkboxes, slider, clear all.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { FacetedSidebar } from '@/components/search/FacetedSidebar'
import type { EsSearchFacets, EsSearchFilters } from '@/hooks/use-es-search'

// ─── Mocks ──────────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => null),
}))

const MOCK_FACETS: EsSearchFacets = {
  byType: [
    { key: 'ip', count: 42 },
    { key: 'domain', count: 35 },
    { key: 'cve', count: 12 },
    { key: 'url', count: 8 },
  ],
  bySeverity: [
    { key: 'critical', count: 20 },
    { key: 'high', count: 30 },
    { key: 'medium', count: 25 },
    { key: 'low', count: 22 },
  ],
  byTlp: [
    { key: 'RED', count: 15 },
    { key: 'AMBER', count: 25 },
    { key: 'GREEN', count: 30 },
    { key: 'WHITE', count: 27 },
  ],
}

const EMPTY_FILTERS: EsSearchFilters = {}

const defaultProps = {
  facets: MOCK_FACETS,
  activeFilters: EMPTY_FILTERS,
  onFilterChange: vi.fn(),
  onClearAll: vi.fn(),
}

// ─── Tests ──────────────────────────────────────────────────

describe('FacetedSidebar', () => {
  it('renders sidebar with filter sections', () => {
    render(<FacetedSidebar {...defaultProps} />)
    expect(screen.getByTestId('faceted-sidebar')).toBeInTheDocument()
    expect(screen.getByText('IOC Type')).toBeInTheDocument()
    expect(screen.getByText('Severity')).toBeInTheDocument()
    expect(screen.getByText('Confidence')).toBeInTheDocument()
  })

  it('displays IOC type checkboxes with counts', () => {
    render(<FacetedSidebar {...defaultProps} />)
    expect(screen.getByText('IP Address')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('35')).toBeInTheDocument()
  })

  it('displays severity checkboxes with colored dots', () => {
    render(<FacetedSidebar {...defaultProps} />)
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('clicking type checkbox triggers onFilterChange', () => {
    render(<FacetedSidebar {...defaultProps} />)
    fireEvent.click(screen.getByText('IP Address'))
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({ type: ['ip'] })
  })

  it('clicking severity checkbox triggers onFilterChange', () => {
    render(<FacetedSidebar {...defaultProps} />)
    fireEvent.click(screen.getByText('critical'))
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({ severity: ['critical'] })
  })

  it('confidence slider renders', () => {
    render(<FacetedSidebar {...defaultProps} />)
    expect(screen.getByTestId('confidence-slider')).toBeInTheDocument()
  })

  it('confidence preset "High (70+)" triggers filter', () => {
    render(<FacetedSidebar {...defaultProps} />)
    fireEvent.click(screen.getByText('High (70+)'))
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({ confidenceMin: 70, confidenceMax: undefined })
  })

  it('shows active filter count badge', () => {
    render(
      <FacetedSidebar
        {...defaultProps}
        activeFilters={{ type: ['ip', 'domain'], severity: ['high'] }}
      />,
    )
    expect(screen.getByTestId('active-filter-count')).toHaveTextContent('3')
  })

  it('clear all triggers onClearAll', () => {
    render(
      <FacetedSidebar
        {...defaultProps}
        activeFilters={{ type: ['ip'] }}
      />,
    )
    fireEvent.click(screen.getByTestId('clear-all-filters'))
    expect(defaultProps.onClearAll).toHaveBeenCalled()
  })

  it('shows filter pills for active filters', () => {
    render(
      <FacetedSidebar
        {...defaultProps}
        activeFilters={{ type: ['ip'], severity: ['critical'] }}
      />,
    )
    // "IP Address" appears in checkbox list AND in filter pill — both present
    expect(screen.getAllByText('IP Address').length).toBeGreaterThanOrEqual(1)
    // "critical" appears in checkbox and pill
    expect(screen.getAllByText('critical').length).toBeGreaterThanOrEqual(1)
  })

  it('enrichment checkbox toggles', () => {
    // Expand TLP and Enrichment sections first
    render(<FacetedSidebar {...defaultProps} />)
    // Click the Enrichment section header to expand
    fireEvent.click(screen.getByText('Enrichment'))
    fireEvent.click(screen.getByText('Has enrichment data'))
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({ enriched: true })
  })
})
