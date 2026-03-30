/**
 * @module __tests__/compliance-reports-panel.test
 * @description Tests for ComplianceReportsList and DsarPanel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ComplianceReportsList, DsarPanel } from '@/components/command-center/ComplianceReportsPanel'

// ─── Mock hooks ──────────────────────────────────────────────

const mockGenerateMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockDsarMutate = vi.fn()

vi.mock('@/hooks/use-compliance-reports', () => ({
  useComplianceReports: () => ({
    data: {
      data: [
        { id: 'cr1', type: 'soc2_access_review', periodStart: '2026-01-01', periodEnd: '2026-03-31', scope: 'Platform-wide', status: 'completed', generatedBy: 'admin@etip.io', createdAt: '2026-03-28T10:00:00Z', sizeBytes: 145200, data: { summary: { totalUsers: 48, active: 42, inactive: 6, period: 'Q1 2026' } } },
        { id: 'cr2', type: 'privileged_access', periodStart: '2026-01-01', periodEnd: '2026-03-31', scope: 'Platform-wide', status: 'completed', generatedBy: 'admin@etip.io', createdAt: '2026-03-27T14:00:00Z', sizeBytes: 89100 },
        { id: 'cr3', type: 'gdpr_dsar', periodStart: '2026-01-01', periodEnd: '2026-03-31', scope: 'user@example.com', status: 'generating', generatedBy: 'admin@acme.com', createdAt: '2026-03-30T12:00:00Z' },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false, isDemo: false,
  }),
  useGenerateReport: () => ({ mutate: mockGenerateMutate, isPending: false }),
  useComplianceReport: (_id: string) => ({
    data: {
      id: 'cr1', type: 'soc2_access_review', periodStart: '2026-01-01', periodEnd: '2026-03-31',
      scope: 'Platform-wide', status: 'completed', generatedBy: 'admin@etip.io', createdAt: '2026-03-28T10:00:00Z',
      data: {
        summary: { totalUsers: 48, active: 42, inactive: 6, period: 'Q1 2026' },
        roleDistribution: { super_admin: 3, analyst: 25 },
        mfaAdoption: { enabledPercent: 78, total: 48, enabled: 37 },
      },
    },
    isLoading: false, isDemo: false,
  }),
  useDeleteReport: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useDsarExports: () => ({
    data: {
      data: [
        { id: 'd1', userId: 'u10', userName: 'Employee A', status: 'completed', requestedAt: '2026-03-25T10:00:00Z', sizeBytes: 52300 },
        { id: 'd2', userId: 'u11', userName: 'Employee B', status: 'generating', requestedAt: '2026-03-30T14:00:00Z' },
      ],
      total: 2, page: 1, limit: 50,
    },
    isLoading: false, isDemo: false,
  }),
  useGenerateDsar: () => ({ mutate: mockDsarMutate, isPending: false }),
  useDsarExport: () => ({ data: null, isLoading: false }),
}))

vi.mock('@/hooks/use-phase5-data', () => ({
  useUsers: () => ({
    data: {
      data: [
        { id: 'u10', displayName: 'Employee A', email: 'a@corp.com' },
        { id: 'u11', displayName: 'Employee B', email: 'b@corp.com' },
      ],
    },
    isLoading: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'u0', role: 'super_admin', tenantId: 't1' }, tenant: { plan: 'teams' } }),
}))

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// ─── ComplianceReportsList Tests ────────────────────────────

describe('ComplianceReportsList', () => {
  beforeEach(() => { mockGenerateMutate.mockClear(); mockDeleteMutate.mockClear() })

  it('renders reports table', () => {
    render(<ComplianceReportsList />)
    expect(screen.getByTestId('compliance-reports-panel')).toBeInTheDocument()
    expect(screen.getByTestId('reports-table')).toBeInTheDocument()
  })

  it('shows correct report types', () => {
    render(<ComplianceReportsList />)
    const table = screen.getByTestId('reports-table')
    expect(table.textContent).toContain('SOC 2 Access Review')
    expect(table.textContent).toContain('Privileged Access')
    expect(table.textContent).toContain('GDPR DSAR')
  })

  it('shows correct status badges', () => {
    render(<ComplianceReportsList />)
    const table = screen.getByTestId('reports-table')
    // 2 completed badges in table rows (cr1, cr2) + "Completed" also in filter dropdown
    const completedInTable = table.querySelectorAll('tbody span')
    const completedLabels = Array.from(completedInTable).filter(el => el.textContent === 'Completed')
    expect(completedLabels.length).toBe(2)
    expect(table.textContent).toContain('Generating')
  })

  it('shows view/download buttons only for completed reports', () => {
    render(<ComplianceReportsList />)
    expect(screen.getByTestId('view-btn-cr1')).toBeInTheDocument()
    expect(screen.getByTestId('view-btn-cr2')).toBeInTheDocument()
    expect(screen.queryByTestId('view-btn-cr3')).not.toBeInTheDocument()
  })

  it('shows delete button for all reports', () => {
    render(<ComplianceReportsList />)
    expect(screen.getByTestId('delete-btn-cr1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-btn-cr3')).toBeInTheDocument()
  })

  it('generate report button opens modal', () => {
    render(<ComplianceReportsList />)
    fireEvent.click(screen.getByTestId('generate-report-btn'))
    expect(screen.getByTestId('report-type-select')).toBeInTheDocument()
  })

  it('DSAR type shows user email input', () => {
    render(<ComplianceReportsList />)
    fireEvent.click(screen.getByTestId('generate-report-btn'))
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'gdpr_dsar' } })
    expect(screen.getByTestId('dsar-user-input')).toBeInTheDocument()
  })

  it('generate calls mutation', () => {
    render(<ComplianceReportsList />)
    fireEvent.click(screen.getByTestId('generate-report-btn'))
    fireEvent.click(screen.getByTestId('generate-report-submit'))
    expect(mockGenerateMutate).toHaveBeenCalledTimes(1)
  })

  it('delete confirmation shows modal and calls mutation', () => {
    render(<ComplianceReportsList />)
    fireEvent.click(screen.getByTestId('delete-btn-cr1'))
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('delete-confirm-btn'))
    expect(mockDeleteMutate).toHaveBeenCalledWith('cr1', expect.any(Object))
  })

  it('filter by type works', () => {
    render(<ComplianceReportsList />)
    expect(screen.getByTestId('filter-report-type')).toBeInTheDocument()
    expect(screen.getByTestId('filter-report-status')).toBeInTheDocument()
  })

  it('view button opens report viewer with data', () => {
    render(<ComplianceReportsList />)
    fireEvent.click(screen.getByTestId('view-btn-cr1'))
    expect(screen.getByTestId('soc2-report-view')).toBeInTheDocument()
    expect(screen.getByText('Q1 2026')).toBeInTheDocument()
  })
})

// ─── DsarPanel Tests ────────────────────────────────────────

describe('DsarPanel', () => {
  beforeEach(() => { mockDsarMutate.mockClear() })

  it('renders DSAR table', () => {
    render(<DsarPanel />)
    expect(screen.getByTestId('dsar-panel')).toBeInTheDocument()
    expect(screen.getByTestId('dsar-table')).toBeInTheDocument()
  })

  it('shows DSAR exports with status', () => {
    render(<DsarPanel />)
    expect(screen.getByText('Employee A')).toBeInTheDocument()
    expect(screen.getByText('Employee B')).toBeInTheDocument()
  })

  it('generate DSAR button opens modal with user selector', () => {
    render(<DsarPanel />)
    fireEvent.click(screen.getByTestId('generate-dsar-btn'))
    expect(screen.getByTestId('dsar-user-select')).toBeInTheDocument()
  })

  it('user dropdown shows org users', () => {
    render(<DsarPanel />)
    fireEvent.click(screen.getByTestId('generate-dsar-btn'))
    const select = screen.getByTestId('dsar-user-select') as HTMLSelectElement
    const options = Array.from(select.options).map(o => o.text)
    expect(options).toContain('Employee A')
    expect(options).toContain('Employee B')
  })

  it('generate calls mutation with selected userId', () => {
    render(<DsarPanel />)
    fireEvent.click(screen.getByTestId('generate-dsar-btn'))
    fireEvent.change(screen.getByTestId('dsar-user-select'), { target: { value: 'u10' } })
    fireEvent.click(screen.getByTestId('dsar-generate-submit'))
    expect(mockDsarMutate).toHaveBeenCalledWith({ userId: 'u10' }, expect.any(Object))
  })

  it('generate button disabled when no user selected', () => {
    render(<DsarPanel />)
    fireEvent.click(screen.getByTestId('generate-dsar-btn'))
    const btn = screen.getByTestId('dsar-generate-submit') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
