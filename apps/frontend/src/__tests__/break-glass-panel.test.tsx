/**
 * @module __tests__/break-glass-panel.test
 * @description Tests for BreakGlassPanel — status card, audit log,
 * rotate password, force terminate, date filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { BreakGlassPanel } from '@/components/command-center/BreakGlassPanel'

// ─── Mock hooks ──────────────────────────────────────────────

const mockRotateMutate = vi.fn()
const mockTerminateMutate = vi.fn()

const INACTIVE_STATUS = {
  activeSession: false,
  lastUsed: '2026-03-25T03:15:00Z',
  useCount: 2,
}

const ACTIVE_STATUS = {
  activeSession: true,
  lastUsed: '2026-03-30T01:00:00Z',
  useCount: 3,
  session: {
    ip: '203.0.113.42',
    geo: 'Mumbai, IN',
    startedAt: '2026-03-30T01:00:00Z',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  },
}

const DEMO_AUDIT = [
  { id: 'a1', event: 'login.success', ip: '203.0.113.42', location: 'Mumbai, IN', timestamp: '2026-03-25T03:15:00Z', details: null, riskLevel: 'critical' },
  { id: 'a2', event: 'action.GET /admin/tenants', ip: '203.0.113.42', location: 'Mumbai, IN', timestamp: '2026-03-25T03:15:30Z', details: 'Listed all tenants', riskLevel: 'critical' },
  { id: 'a3', event: 'session_expired', ip: '203.0.113.42', location: 'Mumbai, IN', timestamp: '2026-03-25T03:30:00Z', details: 'Session TTL exceeded', riskLevel: 'critical' },
  { id: 'a4', event: 'login.failed', ip: '198.51.100.10', location: 'Unknown', timestamp: '2026-03-20T22:10:00Z', details: 'Invalid password', riskLevel: 'critical' },
  { id: 'a5', event: 'login.locked', ip: '198.51.100.10', location: 'Unknown', timestamp: '2026-03-20T22:12:00Z', details: 'Locked after 5 failed attempts', riskLevel: 'critical' },
]

let currentStatus: any = INACTIVE_STATUS

vi.mock('@/hooks/use-break-glass', () => ({
  useBreakGlassStatus: () => ({
    data: currentStatus,
    isLoading: false, isDemo: false,
    DEMO_STATUS_ACTIVE: ACTIVE_STATUS,
  }),
  useBreakGlassAudit: () => ({
    data: { data: DEMO_AUDIT, total: DEMO_AUDIT.length },
    isLoading: false, isDemo: false,
  }),
  useRotateBreakGlassPassword: () => ({
    mutate: mockRotateMutate,
    isPending: false,
  }),
  useForceTerminateBreakGlass: () => ({
    mutate: mockTerminateMutate,
    isPending: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'u0', role: 'super_admin', tenantId: 't0' } }),
}))

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// ─── Tests: Inactive session ────────────────────────────────

describe('BreakGlassPanel — no active session', () => {
  beforeEach(() => {
    currentStatus = INACTIVE_STATUS
    mockRotateMutate.mockClear()
    mockTerminateMutate.mockClear()
  })

  it('renders green Ready status card', () => {
    render(<BreakGlassPanel />)
    const card = screen.getByTestId('break-glass-status-card')
    expect(card).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Total uses: 2')).toBeInTheDocument()
  })

  it('does not show force terminate button', () => {
    render(<BreakGlassPanel />)
    expect(screen.queryByTestId('force-terminate-btn')).not.toBeInTheDocument()
  })

  it('renders audit log with colored event badges', () => {
    render(<BreakGlassPanel />)
    const table = screen.getByTestId('audit-table')
    expect(table).toBeInTheDocument()
    expect(screen.getByText('Emergency Login')).toBeInTheDocument()
    expect(screen.getByText('Failed Attempt')).toBeInTheDocument()
    expect(screen.getByText('Locked Out')).toBeInTheDocument()
    expect(screen.getByText('Session Expired')).toBeInTheDocument()
    expect(screen.getByText(/Action:/)).toBeInTheDocument()
  })

  it('date filter input is present', () => {
    render(<BreakGlassPanel />)
    expect(screen.getByTestId('audit-date-filter')).toBeInTheDocument()
  })

  it('opens rotate password modal', () => {
    render(<BreakGlassPanel />)
    fireEvent.click(screen.getByTestId('rotate-password-btn'))
    expect(screen.getByTestId('rotate-password-modal')).toBeInTheDocument()
  })

  it('rotate password: < 20 chars disables submit', () => {
    render(<BreakGlassPanel />)
    fireEvent.click(screen.getByTestId('rotate-password-btn'))
    const confirmBtn = screen.getByTestId('rotate-password-confirm-btn')
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(screen.getByTestId('rotate-password-input'), { target: { value: 'short' } })
    expect(confirmBtn).toBeDisabled()
  })

  it('rotate password: valid length enables submit and calls mutate', () => {
    render(<BreakGlassPanel />)
    fireEvent.click(screen.getByTestId('rotate-password-btn'))

    const longPassword = 'a'.repeat(25)
    fireEvent.change(screen.getByTestId('rotate-password-input'), { target: { value: longPassword } })
    const confirmBtn = screen.getByTestId('rotate-password-confirm-btn')
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)
    expect(mockRotateMutate).toHaveBeenCalled()
  })
})

// ─── Tests: Active session ──────────────────────────────────

describe('BreakGlassPanel — active session', () => {
  beforeEach(() => {
    currentStatus = ACTIVE_STATUS
    mockTerminateMutate.mockClear()
  })

  it('renders red pulsing ACTIVE SESSION card with IP and geo', () => {
    render(<BreakGlassPanel />)
    expect(screen.getByText('ACTIVE SESSION')).toBeInTheDocument()
    // IP and geo appear in both status card and audit log
    const card = screen.getByTestId('break-glass-status-card')
    expect(card.textContent).toContain('203.0.113.42')
    expect(card.textContent).toContain('Mumbai, IN')
  })

  it('shows remaining time countdown', () => {
    render(<BreakGlassPanel />)
    expect(screen.getByText(/\d+ min/)).toBeInTheDocument()
  })

  it('shows force terminate button', () => {
    render(<BreakGlassPanel />)
    expect(screen.getByTestId('force-terminate-btn')).toBeInTheDocument()
  })

  it('force terminate: confirm modal → DELETE called', () => {
    render(<BreakGlassPanel />)
    fireEvent.click(screen.getByTestId('force-terminate-btn'))
    expect(screen.getByTestId('terminate-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('terminate-confirm-btn'))
    expect(mockTerminateMutate).toHaveBeenCalled()
  })
})
