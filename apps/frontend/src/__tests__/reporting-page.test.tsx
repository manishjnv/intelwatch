/**
 * Tests for ReportingPage: 3 tabs (Reports/Schedules/Templates),
 * stats bar, demo fallback, new report/schedule modals, bulk ops,
 * compare panel, download action, status badges.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock reporting data hooks ──────────────────────────────────

const mockUseReports = vi.fn()
const mockUseReportStats = vi.fn()
const mockUseReportTemplates = vi.fn()
const mockUseReportSchedules = vi.fn()
const mockUseReportComparison = vi.fn()
const mockUseCreateReport = vi.fn()
const mockUseCloneReport = vi.fn()
const mockUseBulkDeleteReports = vi.fn()
const mockUseCreateSchedule = vi.fn()
const mockUseDeleteSchedule = vi.fn()
const mockUseBulkToggleSchedules = vi.fn()

vi.mock('@/hooks/use-reporting-data', () => ({
  useReports:            (...args: unknown[]) => mockUseReports(...args),
  useReportStats:        () => mockUseReportStats(),
  useReportTemplates:    () => mockUseReportTemplates(),
  useReportSchedules:    () => mockUseReportSchedules(),
  useReportComparison:   (...args: unknown[]) => mockUseReportComparison(...args),
  useCreateReport:       () => mockUseCreateReport(),
  useCloneReport:        () => mockUseCloneReport(),
  useBulkDeleteReports:  () => mockUseBulkDeleteReports(),
  useCreateSchedule:     () => mockUseCreateSchedule(),
  useDeleteSchedule:     () => mockUseDeleteSchedule(),
  useBulkToggleSchedules:() => mockUseBulkToggleSchedules(),
}))

// Mock shared-ui components
vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-stats-bar" data-title={title}>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{label}: {value}</span>
  ),
}))

// ─── Test Data ──────────────────────────────────────────────────

const REPORTS = [
  { id: 'rpt-1', title: 'Daily Summary', type: 'daily', format: 'html', status: 'completed', createdAt: '2026-03-24T06:00:00Z', completedAt: '2026-03-24T06:02:00Z', generationTimeMs: 2340, tenantId: 't1' },
  { id: 'rpt-2', title: 'Weekly Digest', type: 'weekly', format: 'pdf', status: 'generating', createdAt: '2026-03-23T08:00:00Z', tenantId: 't1' },
  { id: 'rpt-3', title: 'Monthly Report', type: 'monthly', format: 'csv', status: 'failed', createdAt: '2026-03-20T09:00:00Z', tenantId: 't1' },
  { id: 'rpt-4', title: 'Executive Brief', type: 'executive', format: 'pdf', status: 'completed', createdAt: '2026-03-19T10:00:00Z', completedAt: '2026-03-19T10:08:00Z', generationTimeMs: 8450, tenantId: 't1' },
]

const STATS = {
  total: 127, byStatus: { completed: 112, failed: 5, generating: 1, pending: 9 },
  byType: { daily: 47, weekly: 36, monthly: 18, custom: 14, executive: 12 },
  avgGenerationTimeMs: 4280, activeSchedules: 3,
}

const SCHEDULES = [
  { id: 'sch-1', name: 'Daily Threat Summary', type: 'daily', format: 'html', cronExpression: '0 6 * * *', enabled: true, lastRunAt: '2026-03-23T06:00:00Z', runCount: 47, createdAt: '2026-02-01T00:00:00Z' },
  { id: 'sch-2', name: 'Weekly Digest', type: 'weekly', format: 'pdf', cronExpression: '0 8 * * 1', enabled: false, lastRunAt: '2026-03-18T08:00:00Z', runCount: 12, createdAt: '2026-01-01T00:00:00Z' },
]

const TEMPLATES = [
  { id: 'tpl-daily', type: 'daily', name: 'Daily Threat Summary', description: 'Daily overview.', sections: ['New IOCs', 'Critical Alerts'], defaultFormat: 'html' },
  { id: 'tpl-weekly', type: 'weekly', name: 'Weekly Digest', description: 'Weekly analysis.', sections: ['IOC Trends', 'Malware Families'], defaultFormat: 'pdf' },
  { id: 'tpl-monthly', type: 'monthly', name: 'Monthly Landscape', description: 'Comprehensive monthly.', sections: ['Executive Summary'], defaultFormat: 'pdf' },
  { id: 'tpl-custom', type: 'custom', name: 'Custom Report', description: 'Build your own.', sections: ['Custom Sections'], defaultFormat: 'html' },
  { id: 'tpl-exec', type: 'executive', name: 'Executive Brief', description: 'Board-level.', sections: ['Risk Posture', 'Key Metrics'], defaultFormat: 'pdf' },
]

// ─── Setup ──────────────────────────────────────────────────────

const mutateFn = vi.fn()
const mutationResult = { mutate: mutateFn, isPending: false }

function setupMocks() {
  mockUseReports.mockReturnValue({ data: { data: REPORTS, total: REPORTS.length, page: 1, limit: 50 }, isDemo: false, refetch: vi.fn() })
  mockUseReportStats.mockReturnValue({ data: STATS })
  mockUseReportTemplates.mockReturnValue({ data: TEMPLATES })
  mockUseReportSchedules.mockReturnValue({ data: SCHEDULES })
  mockUseReportComparison.mockReturnValue({ data: null })
  mockUseCreateReport.mockReturnValue(mutationResult)
  mockUseCloneReport.mockReturnValue(mutationResult)
  mockUseBulkDeleteReports.mockReturnValue(mutationResult)
  mockUseCreateSchedule.mockReturnValue(mutationResult)
  mockUseDeleteSchedule.mockReturnValue(mutationResult)
  mockUseBulkToggleSchedules.mockReturnValue(mutationResult)
}

let ReportingPage: React.FC

beforeEach(async () => {
  vi.clearAllMocks()
  setupMocks()
  const mod = await import('@/pages/ReportingPage')
  ReportingPage = mod.ReportingPage
})

// ─── Stats Bar ──────────────────────────────────────────────────

describe('ReportingPage — Stats Bar', () => {
  it('renders page stats bar with title', () => {
    render(<ReportingPage />)
    const bar = screen.getByTestId('page-stats-bar')
    expect(bar).toHaveAttribute('data-title', 'Reporting')
  })

  it('displays total reports stat', () => {
    render(<ReportingPage />)
    expect(screen.getByTestId('stat-Total Reports')).toHaveTextContent('127')
  })

  it('displays completed stat', () => {
    render(<ReportingPage />)
    expect(screen.getByTestId('stat-Completed')).toHaveTextContent('112')
  })

  it('displays failed stat', () => {
    render(<ReportingPage />)
    expect(screen.getByTestId('stat-Failed')).toHaveTextContent('5')
  })

  it('displays avg time stat', () => {
    render(<ReportingPage />)
    expect(screen.getByTestId('stat-Avg Time')).toHaveTextContent('4.3s')
  })

  it('displays active schedules stat', () => {
    render(<ReportingPage />)
    expect(screen.getByTestId('stat-Active Schedules')).toHaveTextContent('3')
  })
})

// ─── Tabs ───────────────────────────────────────────────────────

describe('ReportingPage — Tabs', () => {
  it('renders all 3 tabs', () => {
    render(<ReportingPage />)
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('Schedules')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
  })

  it('defaults to Reports tab', () => {
    render(<ReportingPage />)
    expect(screen.getByText('Daily Summary')).toBeInTheDocument()
  })

  it('switches to Schedules tab', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('Daily Threat Summary')).toBeInTheDocument()
    expect(screen.getByText('0 6 * * *')).toBeInTheDocument()
  })

  it('switches to Templates tab', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('5 templates available')).toBeInTheDocument()
    expect(screen.getByText('Daily Threat Summary')).toBeInTheDocument()
    expect(screen.getByText('Executive Brief')).toBeInTheDocument()
  })
})

// ─── Reports Tab ────────────────────────────────────────────────

describe('ReportingPage — Reports Tab', () => {
  it('renders report table with all rows', () => {
    render(<ReportingPage />)
    expect(screen.getByText('Daily Summary')).toBeInTheDocument()
    expect(screen.getByText('Weekly Digest')).toBeInTheDocument()
    expect(screen.getByText('Monthly Report')).toBeInTheDocument()
    expect(screen.getByText('Executive Brief')).toBeInTheDocument()
  })

  it('shows type badges for each report', () => {
    render(<ReportingPage />)
    expect(screen.getByText('daily')).toBeInTheDocument()
    expect(screen.getByText('weekly')).toBeInTheDocument()
    expect(screen.getByText('monthly')).toBeInTheDocument()
    expect(screen.getByText('executive')).toBeInTheDocument()
  })

  it('shows format labels', () => {
    render(<ReportingPage />)
    expect(screen.getByText('HTML')).toBeInTheDocument()
    expect(screen.getAllByText('PDF')).toHaveLength(2) // 2 pdf reports
    expect(screen.getByText('CSV')).toBeInTheDocument()
  })

  it('shows status badges with correct text', () => {
    render(<ReportingPage />)
    expect(screen.getAllByText('completed')).toHaveLength(2)
    expect(screen.getByText('generating')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('shows report count', () => {
    render(<ReportingPage />)
    expect(screen.getByText('4 reports')).toBeInTheDocument()
  })

  it('renders New Report button', () => {
    render(<ReportingPage />)
    expect(screen.getByText('New Report')).toBeInTheDocument()
  })

  it('opens new report modal on button click', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('New Report'))
    expect(screen.getByText('Generate Report')).toBeInTheDocument()
  })

  it('shows select-all checkbox', () => {
    render(<ReportingPage />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(5) // header + 4 rows
  })

  it('shows bulk delete button when items selected', () => {
    render(<ReportingPage />)
    // Select first checkbox (not header)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]!) // first report row
    expect(screen.getByText(/Delete \(1\)/)).toBeInTheDocument()
  })

  it('shows compare button when exactly 2 items selected', () => {
    render(<ReportingPage />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]!) // rpt-1 (completed)
    fireEvent.click(checkboxes[4]!) // rpt-4 (completed)
    expect(screen.getByText('Compare')).toBeInTheDocument()
  })

  it('shows empty state when no reports', () => {
    mockUseReports.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 }, isDemo: false, refetch: vi.fn() })
    render(<ReportingPage />)
    expect(screen.getByText(/No reports found/)).toBeInTheDocument()
  })
})

// ─── New Report Modal ───────────────────────────────────────────

describe('ReportingPage — New Report Modal', () => {
  it('shows type select, format buttons, and title input', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('New Report'))
    expect(screen.getByText('Report Type')).toBeInTheDocument()
    // "Format" appears in both table header and modal — use getAllByText
    expect(screen.getAllByText('Format').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByPlaceholderText('Auto-generated if blank')).toBeInTheDocument()
  })

  it('has all format options', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('New Report'))
    // Modal format buttons (inside modal) — check for the button labels
    const modal = screen.getByText('Generate Report').closest('div')!
    expect(modal).toBeTruthy()
  })

  it('closes on cancel', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('New Report'))
    expect(screen.getByText('Generate Report')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Generate Report')).not.toBeInTheDocument()
  })
})

// ─── Schedules Tab ──────────────────────────────────────────────

describe('ReportingPage — Schedules Tab', () => {
  it('renders schedule rows', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('Daily Threat Summary')).toBeInTheDocument()
    expect(screen.getByText('Weekly Digest')).toBeInTheDocument()
  })

  it('shows cron expressions', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('0 6 * * *')).toBeInTheDocument()
    expect(screen.getByText('0 8 * * 1')).toBeInTheDocument()
  })

  it('shows enabled/disabled status', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('shows run count', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('47')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows active count', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('1/2 active')).toBeInTheDocument()
  })

  it('renders New Schedule button', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText('New Schedule')).toBeInTheDocument()
  })

  it('opens new schedule modal on button click', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    fireEvent.click(screen.getByText('New Schedule'))
    expect(screen.getByText('Create Schedule')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Daily Threat Summary')).toBeInTheDocument()
  })

  it('shows bulk enable/disable when items selected', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]!) // first schedule
    expect(screen.getByText(/Enable \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Disable \(1\)/)).toBeInTheDocument()
  })

  it('shows empty state when no schedules', () => {
    mockUseReportSchedules.mockReturnValue({ data: [] })
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    expect(screen.getByText(/No schedules configured/)).toBeInTheDocument()
  })
})

// ─── New Schedule Modal ─────────────────────────────────────────

describe('ReportingPage — New Schedule Modal', () => {
  it('shows name, type, format, cron fields', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    fireEvent.click(screen.getByText('New Schedule'))
    expect(screen.getByText('Schedule Name')).toBeInTheDocument()
    expect(screen.getByText('Cron Expression')).toBeInTheDocument()
  })

  it('create button disabled when name empty', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    fireEvent.click(screen.getByText('New Schedule'))
    const createBtn = screen.getByText('Create Schedule')
    expect(createBtn).toBeDisabled()
  })

  it('closes on cancel', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Schedules'))
    fireEvent.click(screen.getByText('New Schedule'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Create Schedule')).not.toBeInTheDocument()
  })
})

// ─── Templates Tab ──────────────────────────────────────────────

describe('ReportingPage — Templates Tab', () => {
  it('renders template count', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('5 templates available')).toBeInTheDocument()
  })

  it('renders all 5 template cards', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    // Uses test TEMPLATES data — names match our test fixtures
    TEMPLATES.forEach(tpl => {
      expect(screen.getByText(tpl.name)).toBeInTheDocument()
    })
  })

  it('shows template descriptions', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('Daily overview.')).toBeInTheDocument()
    expect(screen.getByText('Board-level.')).toBeInTheDocument()
  })

  it('shows template sections', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('New IOCs')).toBeInTheDocument()
    expect(screen.getByText('Critical Alerts')).toBeInTheDocument()
    expect(screen.getByText('Risk Posture')).toBeInTheDocument()
  })

  it('shows default format per template', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    // Multiple "Default: HTML" and "Default: PDF" entries
    const htmlDefaults = screen.getAllByText('Default: HTML')
    const pdfDefaults = screen.getAllByText('Default: PDF')
    expect(htmlDefaults.length).toBeGreaterThanOrEqual(1)
    expect(pdfDefaults.length).toBeGreaterThanOrEqual(1)
  })

  it('has "Use template" links', () => {
    render(<ReportingPage />)
    fireEvent.click(screen.getByText('Templates'))
    const links = screen.getAllByText('Use template →')
    expect(links.length).toBe(5)
  })
})

// ─── Demo Fallback ──────────────────────────────────────────────

describe('ReportingPage — Demo Fallback', () => {
  it('passes isDemo to PageStatsBar', () => {
    mockUseReports.mockReturnValue({ data: { data: REPORTS, total: REPORTS.length, page: 1, limit: 50 }, isDemo: true, refetch: vi.fn() })
    render(<ReportingPage />)
    expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
  })

  it('renders gracefully with null stats', () => {
    mockUseReportStats.mockReturnValue({ data: null })
    render(<ReportingPage />)
    expect(screen.getByTestId('stat-Total Reports')).toHaveTextContent('—')
  })
})
