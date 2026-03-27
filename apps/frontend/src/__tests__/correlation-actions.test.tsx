/**
 * Tests for CorrelationPage bulk action features.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mutable mock state ─────────────────────────────────────────
const mockBulkFeedback = vi.fn()
const mockTriggerMutate = vi.fn()

let correlatePending = false

const CORRELATIONS = [
  { id: 'corr-1', title: 'Shared C2 Infrastructure', description: 'desc1', correlationType: 'infrastructure', severity: 'critical', confidence: 91, entityIds: [], entityLabels: [], killChainPhase: null, diamondModel: null, suppressed: false, createdAt: '2024-01-01' },
  { id: 'corr-2', title: 'Temporal Cluster Alpha', description: 'desc2', correlationType: 'temporal', severity: 'high', confidence: 75, entityIds: [], entityLabels: [], killChainPhase: null, diamondModel: null, suppressed: false, createdAt: '2024-01-02' },
  { id: 'corr-3', title: 'TTP Overlap Beta', description: 'desc3', correlationType: 'ttp_similarity', severity: 'medium', confidence: 60, entityIds: [], entityLabels: [], killChainPhase: null, diamondModel: null, suppressed: false, createdAt: '2024-01-03' },
]

// ─── Hook mocks ─────────────────────────────────────────────────
vi.mock('@/hooks/use-phase4-data', () => ({
  useCorrelations: () => ({ data: { data: CORRELATIONS, total: 3, page: 1, limit: 50 }, isLoading: false, isDemo: false }),
  useCorrelationStats: () => ({ data: { total: 3, byType: {}, bySeverity: {}, suppressedCount: 0, avgConfidence: 70 } }),
  useCampaigns: () => ({ data: { data: [], total: 0 } }),
  useTriggerCorrelation: () => ({ mutate: mockTriggerMutate, isPending: correlatePending, isSuccess: false, data: null }),
  useCorrelationFeedback: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useBulkCorrelationFeedback: () => ({ mutate: mockBulkFeedback, isPending: false }),
  useCreateTicket: () => ({ mutate: vi.fn(), isPending: false }),
  useAddToHunt: () => ({ mutate: vi.fn(), isPending: false }),
  useHuntSessions: () => ({ data: { data: [] }, total: 0 }),
}))

vi.mock('@/hooks/use-phase5-data', () => ({
  useTicketingIntegrations: () => ({ data: { data: [] } }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@/components/CorrelationDetailDrawer', () => ({
  CorrelationDetailDrawer: () => <div data-testid="correlation-detail-drawer" />,
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => <div data-testid="toast-container" />,
}))

vi.mock('@/components/data/DataTable', () => ({
  DataTable: ({ columns, data }: any) => (
    <div data-testid="data-table">
      {data.map((row: any) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          {columns.map((col: any) => (
            <span key={col.key}>{col.render ? col.render(row) : (row as any)[col.key]}</span>
          ))}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/data/FilterBar', () => ({ FilterBar: () => <div /> }))
vi.mock('@/components/data/Pagination', () => ({ Pagination: () => <div /> }))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div>{children}</div>,
  CompactStat: ({ label, value }: any) => <span>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span>{severity}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span>?</span>,
}))

import { CorrelationPage } from '@/pages/CorrelationPage'

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  correlatePending = false
})

describe('CorrelationPage — checkboxes', () => {
  it('renders a checkbox per correlation row with correct data-testid', () => {
    render(<CorrelationPage />)
    expect(screen.getByTestId('check-corr-corr-1')).toBeTruthy()
    expect(screen.getByTestId('check-corr-corr-2')).toBeTruthy()
    expect(screen.getByTestId('check-corr-corr-3')).toBeTruthy()
  })

  it('shows bulk bar after selecting a checkbox', () => {
    render(<CorrelationPage />)
    expect(screen.queryByTestId('bulk-corr-bar')).toBeNull()
    fireEvent.click(screen.getByTestId('check-corr-corr-1'))
    expect(screen.getByTestId('bulk-corr-bar')).toBeTruthy()
  })

  it('clicking checkbox again deselects and hides bar when all unchecked', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByTestId('check-corr-corr-1'))
    expect(screen.getByTestId('bulk-corr-bar')).toBeTruthy()
    fireEvent.click(screen.getByTestId('check-corr-corr-1'))
    expect(screen.queryByTestId('bulk-corr-bar')).toBeNull()
  })
})

describe('CorrelationPage — bulk bar', () => {
  it('shows count of selected items', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByTestId('check-corr-corr-1'))
    fireEvent.click(screen.getByTestId('check-corr-corr-2'))
    expect(screen.getByText('2 selected')).toBeTruthy()
  })

  it('"Mark FP" calls bulkFeedback.mutate with verdict false_positive', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByTestId('check-corr-corr-1'))
    fireEvent.click(screen.getByTestId('check-corr-corr-2'))
    fireEvent.click(screen.getByText('Mark FP'))
    expect(mockBulkFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'false_positive' }),
      expect.any(Object),
    )
  })

  it('"Mark TP" calls bulkFeedback.mutate with verdict true_positive', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByTestId('check-corr-corr-3'))
    fireEvent.click(screen.getByText('Mark TP'))
    expect(mockBulkFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'true_positive' }),
      expect.any(Object),
    )
  })

  it('"Clear" button hides the bulk bar', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByTestId('check-corr-corr-1'))
    expect(screen.getByTestId('bulk-corr-bar')).toBeTruthy()
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.queryByTestId('bulk-corr-bar')).toBeNull()
  })

  it('passes the correct ids array to bulkFeedback.mutate', () => {
    render(<CorrelationPage />)
    fireEvent.click(screen.getByTestId('check-corr-corr-2'))
    fireEvent.click(screen.getByTestId('check-corr-corr-3'))
    fireEvent.click(screen.getByText('Mark FP'))
    expect(mockBulkFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ ids: expect.arrayContaining(['corr-2', 'corr-3']) }),
      expect.any(Object),
    )
  })
})

describe('CorrelationPage — Auto-Correlate button', () => {
  it('renders the Auto-Correlate button', () => {
    render(<CorrelationPage />)
    expect(screen.getByText('Auto-Correlate')).toBeTruthy()
  })

  it('disables the Auto-Correlate button when correlateMutation.isPending is true', () => {
    correlatePending = true
    render(<CorrelationPage />)
    const btn = screen.getByText('Auto-Correlate').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
