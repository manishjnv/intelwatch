/**
 * Tests for SearchResultsTable — columns, sort, pagination, row click, empty state.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { SearchResultsTable } from '@/components/search/SearchResultsTable'
import type { EsSearchResult } from '@/hooks/use-es-search'

// ─── Mocks ──────────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => null),
}))

const MOCK_RESULTS: EsSearchResult[] = [
  {
    id: 'r1', iocType: 'ip', value: '185.220.101.34', severity: 'critical',
    confidence: 92, tags: ['tor-exit', 'c2', 'botnet', 'scanner'], firstSeen: new Date(Date.now() - 2 * 86400000).toISOString(),
    lastSeen: new Date().toISOString(), enriched: true, tlp: 'RED',
  },
  {
    id: 'r2', iocType: 'domain', value: 'evil.darknet.ru', severity: 'high',
    confidence: 78, tags: ['malware'], firstSeen: new Date(Date.now() - 7 * 86400000).toISOString(),
    lastSeen: new Date(Date.now() - 86400000).toISOString(), enriched: false, tlp: 'AMBER',
  },
  {
    id: 'r3', iocType: 'cve', value: 'CVE-2024-3400', severity: 'critical',
    confidence: 99, tags: ['rce'], firstSeen: new Date(Date.now() - 30 * 86400000).toISOString(),
    lastSeen: new Date(Date.now() - 2 * 86400000).toISOString(), enriched: true, tlp: 'WHITE',
  },
]

const defaultProps = {
  results: MOCK_RESULTS,
  totalCount: 42,
  page: 1,
  pageSize: 50,
  sortBy: 'relevance',
  onSort: vi.fn(),
  onPageChange: vi.fn(),
  onRowClick: vi.fn(),
  searchTimeMs: 15,
}

// ─── Tests ──────────────────────────────────────────────────

describe('SearchResultsTable', () => {
  it('renders table with results', () => {
    render(<SearchResultsTable {...defaultProps} />)
    expect(screen.getByTestId('search-results-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('search-result-row')).toHaveLength(3)
  })

  it('renders result header with count', () => {
    render(<SearchResultsTable {...defaultProps} />)
    expect(screen.getByTestId('results-header')).toHaveTextContent('1–42 of 42')
  })

  it('renders type icons per IOC type', () => {
    render(<SearchResultsTable {...defaultProps} />)
    // Type labels
    expect(screen.getByText('ip')).toBeInTheDocument()
    expect(screen.getByText('domain')).toBeInTheDocument()
    expect(screen.getByText('cve')).toBeInTheDocument()
  })

  it('renders severity badges with correct text', () => {
    render(<SearchResultsTable {...defaultProps} />)
    const criticals = screen.getAllByText('critical')
    expect(criticals.length).toBeGreaterThanOrEqual(2) // 2 critical results
  })

  it('renders confidence percentages', () => {
    render(<SearchResultsTable {...defaultProps} />)
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(screen.getByText('99%')).toBeInTheDocument()
  })

  it('renders TLP labels', () => {
    render(<SearchResultsTable {...defaultProps} />)
    expect(screen.getByText('TLP:RED')).toBeInTheDocument()
    expect(screen.getByText('TLP:AMBER')).toBeInTheDocument()
  })

  it('renders tags with overflow indicator', () => {
    render(<SearchResultsTable {...defaultProps} />)
    expect(screen.getByText('tor-exit')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument() // 4 tags, max 3 shown
  })

  it('clicking column header triggers onSort', () => {
    render(<SearchResultsTable {...defaultProps} />)
    fireEvent.click(screen.getByTestId('col-header-severity'))
    expect(defaultProps.onSort).toHaveBeenCalledWith('severity_desc')
  })

  it('clicking row triggers onRowClick with correct ID', () => {
    render(<SearchResultsTable {...defaultProps} />)
    const rows = screen.getAllByTestId('search-result-row')
    fireEvent.click(rows[0])
    expect(defaultProps.onRowClick).toHaveBeenCalledWith('r1')
  })

  it('shows empty state when no results', () => {
    render(<SearchResultsTable {...defaultProps} results={[]} totalCount={0} />)
    expect(screen.getByTestId('results-empty')).toBeInTheDocument()
    expect(screen.getByText('No IOCs match your search')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<SearchResultsTable {...defaultProps} isLoading={true} />)
    expect(screen.getByTestId('results-loading')).toBeInTheDocument()
  })

  it('copy button renders on row', () => {
    render(<SearchResultsTable {...defaultProps} />)
    const copyButtons = screen.getAllByTestId('copy-value')
    expect(copyButtons.length).toBe(3)
  })
})
