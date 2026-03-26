/**
 * Tests for AlertingPage: 4 tabs (Rules/Alerts/Channels/Escalations),
 * stats bar, demo fallback, severity/status filters, bulk actions,
 * history drawer, channel create modal, escalation policy display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock alerting data hooks ───────────────────────────────────

const mockUseAlertRules = vi.fn()
const mockUseAlerts = vi.fn()
const mockUseAlertStats = vi.fn()
const mockUseNotificationChannels = vi.fn()
const mockUseEscalationPolicies = vi.fn()
const mockUseAlertTemplates = vi.fn()
const mockUseToggleRule = vi.fn()
const mockUseDeleteRule = vi.fn()
const mockUseApplyTemplate = vi.fn()
const mockUseAcknowledgeAlert = vi.fn()
const mockUseResolveAlert = vi.fn()
const mockUseEscalateAlert = vi.fn()
const mockUseBulkAcknowledge = vi.fn()
const mockUseBulkResolve = vi.fn()
const mockUseDeleteChannel = vi.fn()
const mockUseTestChannel = vi.fn()
const mockUseCreateEscalation = vi.fn()
const mockUseDeleteEscalation = vi.fn()

vi.mock('@/hooks/use-alerting-data', () => ({
  useAlertRules:          () => mockUseAlertRules(),
  useAlerts:              (...args: unknown[]) => mockUseAlerts(...args),
  useAlertStats:          () => mockUseAlertStats(),
  useNotificationChannels:() => mockUseNotificationChannels(),
  useEscalationPolicies:  () => mockUseEscalationPolicies(),
  useAlertTemplates:      () => mockUseAlertTemplates(),
  useAlertHistory:        () => ({ data: [] }),
  useToggleRule:          () => mockUseToggleRule(),
  useDeleteRule:          () => mockUseDeleteRule(),
  useApplyTemplate:       () => mockUseApplyTemplate(),
  useAcknowledgeAlert:    () => mockUseAcknowledgeAlert(),
  useResolveAlert:        () => mockUseResolveAlert(),
  useEscalateAlert:       () => mockUseEscalateAlert(),
  useBulkAcknowledge:     () => mockUseBulkAcknowledge(),
  useBulkResolve:         () => mockUseBulkResolve(),
  useDeleteChannel:       () => mockUseDeleteChannel(),
  useTestChannel:         () => mockUseTestChannel(),
  useCreateChannel:       () => ({ mutate: vi.fn(), isPending: false }),
  useCreateEscalation:    () => mockUseCreateEscalation(),
  useDeleteEscalation:    () => mockUseDeleteEscalation(),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-stats-bar" data-title={title}>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{label}: {value}</span>
  ),
}))

// ─── Test Data ──────────────────────────────────────────────────

const RULES = [
  { id: 'r-1', name: 'Critical IOC Spike', description: 'Alert when critical IOCs exceed 50', tenantId: 't1', severity: 'critical', condition: { type: 'threshold' }, enabled: true, channelIds: ['ch-1'], escalationPolicyId: null, cooldownMinutes: 30, tags: ['ioc'], lastTriggeredAt: '2026-03-24T04:00:00Z', triggerCount: 14, createdAt: '2026-02-22T00:00:00Z', updatedAt: '2026-03-23T00:00:00Z' },
  { id: 'r-2', name: 'Feed Failure', description: 'No feed data', tenantId: 't1', severity: 'high', condition: { type: 'absence' }, enabled: false, channelIds: [], escalationPolicyId: null, cooldownMinutes: 15, tags: ['feed'], lastTriggeredAt: null, triggerCount: 0, createdAt: '2026-02-10T00:00:00Z', updatedAt: '2026-02-10T00:00:00Z' },
]

const ALERTS = [
  { id: 'a-1', ruleId: 'r-1', ruleName: 'Critical IOC Spike', tenantId: 't1', severity: 'critical', status: 'open', title: '68 critical IOCs detected', description: 'Threshold exceeded', source: {}, acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null, createdAt: '2026-03-24T02:00:00Z', updatedAt: '2026-03-24T02:00:00Z' },
  { id: 'a-2', ruleId: 'r-1', ruleName: 'Critical IOC Spike', tenantId: 't1', severity: 'high', status: 'acknowledged', title: 'Typosquat detected', description: 'DRP alert', source: {}, acknowledgedBy: 'analyst', acknowledgedAt: '2026-03-24T01:00:00Z', resolvedBy: null, resolvedAt: null, suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null, createdAt: '2026-03-24T00:00:00Z', updatedAt: '2026-03-24T01:00:00Z' },
  { id: 'a-3', ruleId: 'r-2', ruleName: 'Feed Failure', tenantId: 't1', severity: 'medium', status: 'resolved', title: 'Feed recovered', description: 'Resolved', source: {}, acknowledgedBy: 'ops', acknowledgedAt: null, resolvedBy: 'ops', resolvedAt: '2026-03-23T12:00:00Z', suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null, createdAt: '2026-03-23T10:00:00Z', updatedAt: '2026-03-23T12:00:00Z' },
]

const CHANNELS = [
  { id: 'ch-1', name: 'SOC Email', tenantId: 't1', type: 'email', config: {}, enabled: true, lastTestedAt: '2026-03-22T00:00:00Z', lastTestSuccess: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-03-22T00:00:00Z' },
  { id: 'ch-2', name: 'Slack Alerts', tenantId: 't1', type: 'slack', config: {}, enabled: true, lastTestedAt: null, lastTestSuccess: null, createdAt: '2026-01-15T00:00:00Z', updatedAt: '2026-01-15T00:00:00Z' },
  { id: 'ch-3', name: 'SIEM Webhook', tenantId: 't1', type: 'webhook', config: {}, enabled: false, lastTestedAt: '2026-03-20T00:00:00Z', lastTestSuccess: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-03-20T00:00:00Z' },
]

const ESCALATIONS = [
  { id: 'esc-1', name: 'Critical Escalation', tenantId: 't1', steps: [{ delayMinutes: 0, channelIds: ['ch-1'], notifyMessage: 'Immediate' }, { delayMinutes: 15, channelIds: ['ch-1', 'ch-2'], notifyMessage: 'Escalated' }], repeatAfterMinutes: 60, enabled: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-03-10T00:00:00Z' },
  { id: 'esc-2', name: 'After Hours', tenantId: 't1', steps: [{ delayMinutes: 5, channelIds: ['ch-2'] }], repeatAfterMinutes: 0, enabled: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
]

const STATS = {
  total: 247, open: 38, acknowledged: 15, resolved: 178, suppressed: 9, escalated: 7,
  bySeverity: { critical: 42, high: 89, medium: 76, low: 31, info: 9 },
  avgResolutionMinutes: 47,
}

const TEMPLATES = [
  { id: 'tpl-1', name: 'Critical IOC Threshold', description: 'Alert on critical IOCs', severity: 'critical', conditionType: 'threshold', tags: ['ioc'] },
  { id: 'tpl-2', name: 'Feed Monitor', description: 'Feed health', severity: 'high', conditionType: 'absence', tags: ['feed'] },
]

// ─── Setup ──────────────────────────────────────────────────────

const mutateFn = vi.fn()
const mutationResult = { mutate: mutateFn, isPending: false }

function setupMocks() {
  mockUseAlertRules.mockReturnValue({ data: RULES, isDemo: false })
  mockUseAlerts.mockReturnValue({ data: { data: ALERTS, total: ALERTS.length, page: 1, limit: 50 }, isDemo: false })
  mockUseAlertStats.mockReturnValue({ data: STATS })
  mockUseNotificationChannels.mockReturnValue({ data: CHANNELS })
  mockUseEscalationPolicies.mockReturnValue({ data: ESCALATIONS })
  mockUseAlertTemplates.mockReturnValue({ data: TEMPLATES })
  mockUseToggleRule.mockReturnValue(mutationResult)
  mockUseDeleteRule.mockReturnValue(mutationResult)
  mockUseApplyTemplate.mockReturnValue(mutationResult)
  mockUseAcknowledgeAlert.mockReturnValue(mutationResult)
  mockUseResolveAlert.mockReturnValue(mutationResult)
  mockUseEscalateAlert.mockReturnValue(mutationResult)
  mockUseBulkAcknowledge.mockReturnValue(mutationResult)
  mockUseBulkResolve.mockReturnValue(mutationResult)
  mockUseDeleteChannel.mockReturnValue(mutationResult)
  mockUseTestChannel.mockReturnValue(mutationResult)
  mockUseCreateEscalation.mockReturnValue(mutationResult)
  mockUseDeleteEscalation.mockReturnValue(mutationResult)
}

// ─── Import page lazily (after mocks) ───────────────────────────

async function renderPage() {
  const { AlertingPage } = await import('@/pages/AlertingPage')
  return render(<AlertingPage />)
}

// ─── Tests ──────────────────────────────────────────────────────

describe('AlertingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  // ── Stats bar ──
  describe('Stats bar', () => {
    it('renders stats bar with title Alerting', async () => {
      await renderPage()
      expect(screen.getByTestId('page-stats-bar')).toHaveAttribute('data-title', 'Alerting')
    })

    it('shows total, open, acknowledged, escalated stats', async () => {
      await renderPage()
      expect(screen.getByTestId('stat-Total')).toHaveTextContent('247')
      expect(screen.getByTestId('stat-Open')).toHaveTextContent('38')
      expect(screen.getByTestId('stat-Acknowledged')).toHaveTextContent('15')
      expect(screen.getByTestId('stat-Escalated')).toHaveTextContent('7')
    })

    it('shows avg resolution time', async () => {
      await renderPage()
      expect(screen.getByTestId('stat-Avg Resolution')).toHaveTextContent('47m')
    })
  })

  // ── Tabs ──
  describe('Tabs', () => {
    it('renders all 4 tab buttons', async () => {
      await renderPage()
      expect(screen.getByText('Alert Rules')).toBeInTheDocument()
      expect(screen.getByText('Alerts')).toBeInTheDocument()
      expect(screen.getByText('Channels')).toBeInTheDocument()
      expect(screen.getByText('Escalation Policies')).toBeInTheDocument()
    })

    it('defaults to Rules tab', async () => {
      await renderPage()
      expect(screen.getByText('Critical IOC Spike')).toBeInTheDocument()
    })
  })

  // ── Rules tab ──
  describe('Rules tab', () => {
    it('renders rule names', async () => {
      await renderPage()
      expect(screen.getByText('Critical IOC Spike')).toBeInTheDocument()
      expect(screen.getByText('Feed Failure')).toBeInTheDocument()
    })

    it('shows severity badges', async () => {
      await renderPage()
      expect(screen.getByText('critical')).toBeInTheDocument()
      expect(screen.getByText('high')).toBeInTheDocument()
    })

    it('shows rule condition types', async () => {
      await renderPage()
      expect(screen.getByText('threshold')).toBeInTheDocument()
      expect(screen.getByText('absence')).toBeInTheDocument()
    })

    it('shows trigger count', async () => {
      await renderPage()
      expect(screen.getByText('14')).toBeInTheDocument()
    })

    it('shows active/total count', async () => {
      await renderPage()
      expect(screen.getByText('1/2 active')).toBeInTheDocument()
    })

    it('renders template quick-apply buttons', async () => {
      await renderPage()
      expect(screen.getByText('+ Critical IOC Threshold')).toBeInTheDocument()
      expect(screen.getByText('+ Feed Monitor')).toBeInTheDocument()
    })

    it('calls applyTemplate on template button click', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('+ Critical IOC Threshold'))
      expect(mutateFn).toHaveBeenCalledWith('tpl-1')
    })

    it('renders toggle buttons for each rule', async () => {
      await renderPage()
      const toggleButtons = screen.getAllByTitle(/Enable|Disable/)
      expect(toggleButtons.length).toBe(2)
    })

    it('calls deleteRule on delete click', async () => {
      await renderPage()
      const deleteButtons = screen.getAllByTitle('Delete rule')
      fireEvent.click(deleteButtons[0]!)
      expect(mutateFn).toHaveBeenCalledWith('r-1')
    })
  })

  // ── Alerts tab ──
  describe('Alerts tab', () => {
    it('renders alert titles when switching to Alerts tab', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      expect(screen.getByText('68 critical IOCs detected')).toBeInTheDocument()
      expect(screen.getByText('Typosquat detected')).toBeInTheDocument()
      expect(screen.getByText('Feed recovered')).toBeInTheDocument()
    })

    it('shows alert count', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      expect(screen.getByText('3 alerts')).toBeInTheDocument()
    })

    it('renders severity and status badges', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      expect(screen.getAllByText('critical').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('open').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('acknowledged').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('resolved').length).toBeGreaterThanOrEqual(1)
    })

    it('renders search input', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      expect(screen.getByPlaceholderText('Search alerts…')).toBeInTheDocument()
    })

    it('filters alerts by search query', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      fireEvent.change(screen.getByPlaceholderText('Search alerts…'), { target: { value: 'IOC' } })
      expect(screen.getByText('68 critical IOCs detected')).toBeInTheDocument()
      expect(screen.queryByText('Feed recovered')).not.toBeInTheDocument()
    })

    it('renders severity filter dropdown', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const select = screen.getByDisplayValue('All severities')
      expect(select).toBeInTheDocument()
    })

    it('renders status filter dropdown', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const select = screen.getByDisplayValue('All statuses')
      expect(select).toBeInTheDocument()
    })

    it('shows acknowledge button on open alerts', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const ackButtons = screen.getAllByTitle('Acknowledge')
      expect(ackButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('shows resolve button on open/acknowledged alerts', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const resolveButtons = screen.getAllByTitle('Resolve')
      expect(resolveButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('shows escalate button on open alerts', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const escButtons = screen.getAllByTitle('Escalate')
      expect(escButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('shows history button on all alerts', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const histButtons = screen.getAllByTitle('View history')
      expect(histButtons.length).toBe(3)
    })

    it('select-all checkbox toggles all alerts', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0]!) // select all
      // Bulk action buttons should appear
      expect(screen.getByText(/Ack \(3\)/)).toBeInTheDocument()
      expect(screen.getByText(/Resolve \(3\)/)).toBeInTheDocument()
    })

    it('individual checkbox selection works', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1]!) // select first alert
      expect(screen.getByText(/Ack \(1\)/)).toBeInTheDocument()
    })

    it('clicking history button opens drawer', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      const histButtons = screen.getAllByTitle('View history')
      fireEvent.click(histButtons[0]!)
      expect(screen.getByText('Alert History')).toBeInTheDocument()
    })
  })

  // ── Channels tab ──
  describe('Channels tab', () => {
    it('renders channel cards', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      expect(screen.getByText('SOC Email')).toBeInTheDocument()
      expect(screen.getByText('Slack Alerts')).toBeInTheDocument()
      expect(screen.getByText('SIEM Webhook')).toBeInTheDocument()
    })

    it('shows active/total count', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      expect(screen.getByText('2/3 active')).toBeInTheDocument()
    })

    it('shows channel type badges', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('slack')).toBeInTheDocument()
      expect(screen.getByText('webhook')).toBeInTheDocument()
    })

    it('shows test result for tested channels', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      expect(screen.getByText('Pass')).toBeInTheDocument()
      expect(screen.getByText('Fail')).toBeInTheDocument()
    })

    it('renders New Channel button', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      expect(screen.getByText('New Channel')).toBeInTheDocument()
    })

    it('opens new channel modal on button click', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      fireEvent.click(screen.getByText('New Channel'))
      expect(screen.getByText('New Notification Channel')).toBeInTheDocument()
    })

    it('renders test buttons for each channel', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      const testButtons = screen.getAllByText('Test')
      expect(testButtons.length).toBe(3)
    })

    it('renders delete buttons for each channel', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      const deleteButtons = screen.getAllByTitle('Delete')
      expect(deleteButtons.length).toBe(3)
    })
  })

  // ── Escalation Policies tab ──
  describe('Escalation Policies tab', () => {
    it('renders escalation policy names', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText('Critical Escalation')).toBeInTheDocument()
      expect(screen.getByText('After Hours')).toBeInTheDocument()
    })

    it('shows active/disabled badges', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('renders escalation steps with delay', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText(/Immediately/)).toBeInTheDocument()
      expect(screen.getByText(/After 15m/)).toBeInTheDocument()
      expect(screen.getByText(/After 5m/)).toBeInTheDocument()
    })

    it('shows step notify messages', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText('Immediate')).toBeInTheDocument()
      expect(screen.getByText('Escalated')).toBeInTheDocument()
    })

    it('shows repeat interval for policies with repeat', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText('Repeats every 60 minutes')).toBeInTheDocument()
    })

    it('shows active/total count', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText('1/2 active')).toBeInTheDocument()
    })

    it('renders New Policy button', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText('New Policy')).toBeInTheDocument()
    })

    it('renders delete buttons for each policy', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      const deleteButtons = screen.getAllByTitle('Delete policy')
      expect(deleteButtons.length).toBe(2)
    })

    it('shows channel count per step', async () => {
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      // Multiple steps reference channel counts — use getAllByText
      expect(screen.getAllByText(/\d+ channels?$/).length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Empty states ──
  describe('Empty states', () => {
    it('shows empty state when no rules', async () => {
      mockUseAlertRules.mockReturnValue({ data: [], isDemo: false })
      mockUseAlertTemplates.mockReturnValue({ data: [] })
      await renderPage()
      expect(screen.getByText(/No alert rules/)).toBeInTheDocument()
    })

    it('shows empty state when no alerts match filters', async () => {
      mockUseAlerts.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 }, isDemo: false })
      await renderPage()
      fireEvent.click(screen.getByText('Alerts'))
      expect(screen.getByText(/No alerts match/)).toBeInTheDocument()
    })

    it('shows empty state when no channels', async () => {
      mockUseNotificationChannels.mockReturnValue({ data: [] })
      await renderPage()
      fireEvent.click(screen.getByText('Channels'))
      expect(screen.getByText(/No notification channels/)).toBeInTheDocument()
    })

    it('shows empty state when no escalation policies', async () => {
      mockUseEscalationPolicies.mockReturnValue({ data: [] })
      await renderPage()
      fireEvent.click(screen.getByText('Escalation Policies'))
      expect(screen.getByText(/No escalation policies/)).toBeInTheDocument()
    })
  })

  // ── Demo mode ──
  describe('Demo mode', () => {
    it('passes isDemo to PageStatsBar', async () => {
      mockUseAlertRules.mockReturnValue({ data: RULES, isDemo: true })
      await renderPage()
      // The isDemo prop is passed to PageStatsBar — verify it renders
      expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
    })
  })
})
