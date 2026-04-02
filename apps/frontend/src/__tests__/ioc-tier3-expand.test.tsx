/**
 * @module __tests__/ioc-tier3-expand.test
 * @description Tests for F5: DataTable expandable rows + InlineEnrichmentRow.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { DataTable } from '@/components/data/DataTable'
import { InlineEnrichmentRow } from '@/components/ioc/InlineEnrichmentRow'

vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}))

vi.mock('@etip/shared-ui/components/SkeletonBlock', () => ({
  SkeletonBlock: () => <div data-testid="skeleton" />,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

// ─── InlineEnrichmentRow ─────────────────────────────────────────
describe('InlineEnrichmentRow', () => {
  it('shows loading state', () => {
    render(<InlineEnrichmentRow enrichment={null} isLoading={true} />)
    expect(screen.getByTestId('enrichment-loading')).toBeInTheDocument()
  })

  it('shows empty state when no enrichment data', () => {
    render(<InlineEnrichmentRow enrichment={null} isLoading={false} />)
    expect(screen.getByTestId('enrichment-empty')).toBeInTheDocument()
  })

  it('renders VT detection ratio', () => {
    render(<InlineEnrichmentRow enrichment={{ vtDetections: 12, vtTotal: 68 }} isLoading={false} />)
    expect(screen.getByTestId('vt-ratio')).toHaveTextContent('12/68')
    expect(screen.getByTestId('vt-ratio')).toHaveTextContent('18%')
  })

  it('renders AbuseIPDB score', () => {
    render(<InlineEnrichmentRow enrichment={{ abuseipdbScore: 87 }} isLoading={false} />)
    expect(screen.getByTestId('abuseipdb-score')).toHaveTextContent('87%')
  })

  it('renders geo info with flag emoji', () => {
    render(<InlineEnrichmentRow enrichment={{ countryCode: 'US', country: 'United States' }} isLoading={false} />)
    expect(screen.getByTestId('geo-info')).toHaveTextContent('United States')
  })

  it('renders risk verdict severity badge', () => {
    render(<InlineEnrichmentRow enrichment={{ severity: 'HIGH' }} isLoading={false} />)
    expect(screen.getByTestId('risk-verdict')).toBeInTheDocument()
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('HIGH')
  })

  it('renders all enrichment fields together', () => {
    render(<InlineEnrichmentRow enrichment={{
      vtDetections: 5, vtTotal: 72, abuseipdbScore: 45,
      countryCode: 'RU', country: 'Russia', severity: 'MEDIUM',
      riskVerdict: 'Suspicious infrastructure',
    }} isLoading={false} />)
    expect(screen.getByTestId('inline-enrichment')).toBeInTheDocument()
    expect(screen.getByTestId('vt-ratio')).toBeInTheDocument()
    expect(screen.getByTestId('abuseipdb-score')).toBeInTheDocument()
    expect(screen.getByTestId('geo-info')).toBeInTheDocument()
    expect(screen.getByTestId('risk-verdict')).toBeInTheDocument()
  })
})

// ─── DataTable expandable rows ───────────────────────────────────
describe('DataTable expandable rows', () => {
  const columns = [
    { key: 'name', label: 'Name', render: (row: any) => row.name },
    { key: 'value', label: 'Value', render: (row: any) => row.value },
  ]
  const data = [
    { id: '1', name: 'Row A', value: '10' },
    { id: '2', name: 'Row B', value: '20' },
  ]

  it('does NOT render chevrons when expandableRow is not provided', () => {
    render(<DataTable columns={columns} data={data} rowKey={r => r.id} />)
    expect(screen.queryByTestId('expand-chevron-1')).toBeNull()
    expect(screen.queryByTestId('expand-chevron-2')).toBeNull()
  })

  it('renders chevron for each row when expandableRow is provided', () => {
    render(
      <DataTable
        columns={columns} data={data} rowKey={r => r.id}
        expandableRow={(row) => <div>Expanded: {row.name}</div>}
        expandedRowId={null} onExpandRow={vi.fn()}
      />
    )
    expect(screen.getByTestId('expand-chevron-1')).toBeInTheDocument()
    expect(screen.getByTestId('expand-chevron-2')).toBeInTheDocument()
  })

  it('shows expanded content when expandedRowId matches', () => {
    render(
      <DataTable
        columns={columns} data={data} rowKey={r => r.id}
        expandableRow={(row) => <div data-testid={`expanded-content-${row.id}`}>Details for {row.name}</div>}
        expandedRowId="1" onExpandRow={vi.fn()}
      />
    )
    expect(screen.getByTestId('expanded-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('expanded-content-1')).toHaveTextContent('Details for Row A')
    expect(screen.queryByTestId('expanded-row-2')).toBeNull()
  })

  it('calls onExpandRow when chevron clicked', () => {
    const onExpand = vi.fn()
    render(
      <DataTable
        columns={columns} data={data} rowKey={r => r.id}
        expandableRow={(row) => <div>{row.name}</div>}
        expandedRowId={null} onExpandRow={onExpand}
      />
    )
    fireEvent.click(screen.getByTestId('expand-chevron-1'))
    expect(onExpand).toHaveBeenCalledWith('1')
  })

  it('calls onExpandRow(null) when clicking expanded row chevron (collapse)', () => {
    const onExpand = vi.fn()
    render(
      <DataTable
        columns={columns} data={data} rowKey={r => r.id}
        expandableRow={(row) => <div>{row.name}</div>}
        expandedRowId="1" onExpandRow={onExpand}
      />
    )
    fireEvent.click(screen.getByTestId('expand-chevron-1'))
    expect(onExpand).toHaveBeenCalledWith(null)
  })
})
