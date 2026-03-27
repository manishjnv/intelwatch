/**
 * Tests for CorrelationPage wired actions: Investigate, Create Ticket, Add to Hunt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mocks ──────────────────────────────────────────────────────

const mockMutate = vi.fn()
const mockTicketMutate = vi.fn()
const mockHuntMutate = vi.fn()

const mockUseCorrelations = vi.fn()
const mockUseCorrelationStats = vi.fn()
const mockUseCampaigns = vi.fn()
const mockUseTriggerCorrelation = vi.fn()
const mockUseHuntSessions = vi.fn()

vi.mock('@/hooks/use-phase4-data', () => ({
  useCorrelations: (...args: any[]) => mockUseCorrelations(...args),
  useCorrelationStats: () => mockUseCorrelationStats(),
  useCampaigns: () => mockUseCampaigns(),
  useTriggerCorrelation: () => mockUseTriggerCorrelation(),
  useCorrelationFeedback: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useCreateTicket: () => ({ mutate: mockTicketMutate, isPending: false }),
  useAddToHunt: () => ({ mutate: mockHuntMutate, isPending: false }),
  useHuntSessions: (...args: any[]) => mockUseHuntSessions(...args),
  useBulkCorrelationFeedback: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

const mockUseTicketingIntegrations = vi.fn()
vi.mock('@/hooks/use-phase5-data', () => ({
  useTicketingIntegrations: () => mockUseTicketingIntegrations(),
}))

vi.mock('@/components/CorrelationDetailDrawer', () => ({
  CorrelationDetailDrawer: ({ correlationId, onClose }: any) =>
    correlationId ? <div data-testid="correlation-detail-drawer"><button onClick={onClose}>Close Drawer</button></div> : null,
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span>{severity}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span>?</span>,
}))

import { CorrelationPage } from '@/pages/CorrelationPage'

// ─── Fixtures ───────────────────────────────────────────────────

const CORRELATION = {
  id: 'corr-1', correlationType: 'infrastructure',
  title: 'Shared C2 Infrastructure', description: '3 IOCs share hosting',
  severity: 'critical', confidence: 91, entityIds: ['n1', 'n2'],
  entityLabels: ['APT28', 'Cobalt Strike'],
  suppressed: false, createdAt: new Date().toISOString(),
  diamondModel: { adversary: 'APT28', infrastructure: '185.x.x.x', capability: 'Cobalt Strike', victim: 'Gov' },
  killChainPhase: 'command_and_control',
}

const HUNT_ACTIVE_1 = { id: 'hunt-1', name: 'APT28 Hunt', status: 'active', huntType: 'hypothesis', createdBy: 'Analyst', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), findingsCount: 4, evidenceCount: 7, hypothesisCount: 3, score: 78, description: 'test' }
const HUNT_ACTIVE_2 = { id: 'hunt-2', name: 'Emotet Analysis', status: 'active', huntType: 'indicator', createdBy: 'Analyst', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), findingsCount: 2, evidenceCount: 3, hypothesisCount: 1, score: 60, description: 'test' }

function setupMocks(hunts = [HUNT_ACTIVE_1], ticketingIntegrations: any[] = [{ id: 'int-1', name: 'Jira', type: 'jira' }]) {
  mockUseCorrelations.mockReturnValue({ data: { data: [CORRELATION], total: 1, page: 1, limit: 50 }, isLoading: false, isDemo: true })
  mockUseCorrelationStats.mockReturnValue({ data: { total: 1, byType: {}, bySeverity: { critical: 1 }, suppressedCount: 0, avgConfidence: 91 } })
  mockUseCampaigns.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })
  mockUseTriggerCorrelation.mockReturnValue({ mutate: mockMutate, isPending: false })
  mockUseHuntSessions.mockReturnValue({ data: { data: hunts, total: hunts.length, page: 1, limit: 50 }, isDemo: true })
  mockUseTicketingIntegrations.mockReturnValue({ data: { data: ticketingIntegrations, total: ticketingIntegrations.length, page: 1, limit: 50 }, isDemo: false })
}

function openDetailPanel() {
  render(<CorrelationPage />)
  fireEvent.click(screen.getByText('Shared C2 Infrastructure'))
}

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

describe('CorrelationPage — Investigate button', () => {
  it('opens investigation drawer when Investigate is clicked', () => {
    openDetailPanel()
    fireEvent.click(screen.getByText('Investigate'))
    expect(screen.getByTestId('correlation-detail-drawer')).toBeTruthy()
  })

  it('closes investigation drawer via close button', () => {
    openDetailPanel()
    fireEvent.click(screen.getByText('Investigate'))
    expect(screen.getByTestId('correlation-detail-drawer')).toBeTruthy()
    fireEvent.click(screen.getByText('Close Drawer'))
    expect(screen.queryByTestId('correlation-detail-drawer')).toBeNull()
  })
})

describe('CorrelationPage — Create Ticket button', () => {
  it('shows Create Ticket button in detail panel', () => {
    openDetailPanel()
    expect(screen.getByText('Create Ticket')).toBeTruthy()
  })

  it('shows toast in demo mode instead of calling mutation', () => {
    openDetailPanel()
    fireEvent.click(screen.getByText('Create Ticket'))
    // In demo mode, toast is shown, mutation is NOT called
    expect(mockTicketMutate).not.toHaveBeenCalled()
  })
})

describe('CorrelationPage — Add to Hunt button', () => {
  it('shows Add to Hunt button in detail panel', () => {
    openDetailPanel()
    expect(screen.getByText('Add to Hunt')).toBeTruthy()
  })

  it('directly adds to single active hunt without selector (demo)', () => {
    setupMocks([HUNT_ACTIVE_1])
    openDetailPanel()
    fireEvent.click(screen.getByText('Add to Hunt'))
    // Demo mode: toast shown, no mutation
    expect(mockHuntMutate).not.toHaveBeenCalled()
  })

  it('shows hunt selector dropdown when multiple active hunts', () => {
    setupMocks([HUNT_ACTIVE_1, HUNT_ACTIVE_2])
    openDetailPanel()
    fireEvent.click(screen.getByText('Add to Hunt'))
    expect(screen.getByTestId('hunt-selector')).toBeTruthy()
    expect(screen.getByText('APT28 Hunt')).toBeTruthy()
    expect(screen.getByText('Emotet Analysis')).toBeTruthy()
  })

  it('selects a hunt from dropdown (demo)', () => {
    setupMocks([HUNT_ACTIVE_1, HUNT_ACTIVE_2])
    openDetailPanel()
    fireEvent.click(screen.getByText('Add to Hunt'))
    fireEvent.click(screen.getByText('APT28 Hunt'))
    // Selector should close
    expect(screen.queryByTestId('hunt-selector')).toBeNull()
  })

  it('shows info toast when no active hunts', () => {
    setupMocks([])
    openDetailPanel()
    fireEvent.click(screen.getByText('Add to Hunt'))
    // No mutation, no selector
    expect(mockHuntMutate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('hunt-selector')).toBeNull()
  })
})

describe('CorrelationPage — P2-3 Ticket Guard', () => {
  it('disables Create Ticket button when no ticketing configured', () => {
    setupMocks([HUNT_ACTIVE_1], [])
    openDetailPanel()
    const btn = screen.getByTestId('create-ticket-btn')
    expect(btn).toHaveProperty('disabled', true)
  })

  it('shows guard tooltip when no ticketing configured', () => {
    setupMocks([HUNT_ACTIVE_1], [])
    openDetailPanel()
    expect(screen.getByTestId('ticket-guard-tooltip')).toBeTruthy()
    expect(screen.getByText(/No ticketing system configured/)).toBeTruthy()
  })

  it('enables Create Ticket button when ticketing is configured', () => {
    setupMocks([HUNT_ACTIVE_1], [{ id: 'int-1', name: 'ServiceNow', type: 'servicenow' }])
    openDetailPanel()
    const btn = screen.getByTestId('create-ticket-btn')
    expect(btn).toHaveProperty('disabled', false)
    expect(screen.queryByTestId('ticket-guard-tooltip')).toBeNull()
  })
})
