/**
 * Tests for CorrelationDetailDrawer component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mocks ──────────────────────────────────────────────────────

const mockQueryFn = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (opts: any) => {
      mockQueryFn(opts.queryKey)
      return { data: null, isLoading: false }
    },
  }
})

vi.mock('@/lib/api', () => ({
  api: vi.fn().mockResolvedValue(null),
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

import { CorrelationDetailDrawer } from '@/components/CorrelationDetailDrawer'

// ─── Fixtures ───────────────────────────────────────────────────

const CORRELATION = {
  id: 'corr-1-abcdef1234567890', correlationType: 'infrastructure' as const,
  title: 'Shared C2 Infrastructure', description: '3 IOCs share hosting on AS-CHOOPA',
  severity: 'critical' as const, confidence: 91, entityIds: ['n1', 'n2'],
  entityLabels: ['APT28', 'Cobalt Strike'],
  suppressed: false, createdAt: new Date().toISOString(),
}

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CorrelationDetailDrawer', () => {
  it('renders nothing when correlationId is null and no fallback', () => {
    render(
      <CorrelationDetailDrawer correlationId={null} fallback={null} onClose={vi.fn()} />,
    )
    expect(screen.queryByTestId('correlation-detail-drawer')).toBeNull()
  })

  it('renders drawer with fallback data when API returns null', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    expect(screen.getByTestId('correlation-detail-drawer')).toBeTruthy()
    expect(screen.getByText('Shared C2 Infrastructure')).toBeTruthy()
    expect(screen.getByText('3 IOCs share hosting on AS-CHOOPA')).toBeTruthy()
  })

  it('shows type badge', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    const infraLabels = screen.getAllByText('Infrastructure')
    expect(infraLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('shows linked entities', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    expect(screen.getByText('APT28')).toBeTruthy()
    expect(screen.getByText('Cobalt Strike')).toBeTruthy()
  })

  it('shows confidence percentage', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    expect(screen.getByText('91% confidence')).toBeTruthy()
  })

  it('shows severity badge', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    expect(screen.getByTestId('severity-badge')).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={onClose} />,
    )
    fireEvent.click(screen.getByLabelText('Close drawer'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('fires query with correct key', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    expect(mockQueryFn).toHaveBeenCalledWith(['correlation-detail', 'corr-1'])
  })

  it('shows metadata details section', () => {
    render(
      <CorrelationDetailDrawer correlationId="corr-1" fallback={CORRELATION} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Details')).toBeTruthy()
    expect(screen.getByText('ID')).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.getByText('Created')).toBeTruthy()
  })
})
