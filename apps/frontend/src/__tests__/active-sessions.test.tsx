/**
 * @module __tests__/active-sessions.test
 * @description Tests for ActiveSessionsList component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ActiveSessionsList } from '@/components/security/ActiveSessionsList'

// ─── Mock hooks ──────────────────────────────────────────────

const mockTerminate = vi.fn()
const mockTerminateAll = vi.fn()

const DEMO_SESSIONS = [
  {
    id: 'sess-current',
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    geoCity: 'Mumbai',
    geoCountry: 'IN',
    geoIsp: 'Jio',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 60_000).toISOString(),
    isCurrent: true,
    suspiciousLogin: false,
  },
  {
    id: 'sess-2',
    ipAddress: '198.51.100.23',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15',
    geoCity: 'Delhi',
    geoCountry: 'IN',
    geoIsp: 'Airtel',
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 7200_000).toISOString(),
    isCurrent: false,
    suspiciousLogin: false,
  },
  {
    id: 'sess-sus',
    ipAddress: '192.0.2.88',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/124.0.0.0 Mobile Safari/537.36',
    geoCity: 'Singapore',
    geoCountry: 'SG',
    geoIsp: 'AWS',
    createdAt: new Date(Date.now() - 172800_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 43200_000).toISOString(),
    isCurrent: false,
    suspiciousLogin: true,
  },
]

vi.mock('@/hooks/use-sessions', () => ({
  useSessions: () => ({
    data: DEMO_SESSIONS,
    isLoading: false,
  }),
  useTerminateSession: () => ({
    mutate: mockTerminate,
    isPending: false,
  }),
  useTerminateAllOtherSessions: () => ({
    mutate: mockTerminateAll,
    isPending: false,
  }),
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

// ─── Tests ──────────────────────────────────────────────────

describe('ActiveSessionsList', () => {
  it('renders all sessions', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByTestId('session-sess-current')).toBeTruthy()
    expect(screen.getByTestId('session-sess-2')).toBeTruthy()
    expect(screen.getByTestId('session-sess-sus')).toBeTruthy()
  })

  it('shows Current Session badge on current session', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByTestId('current-badge')).toBeTruthy()
    expect(screen.getByText('Current Session')).toBeTruthy()
  })

  it('does not show terminate button on current session', () => {
    render(<ActiveSessionsList />)
    expect(screen.queryByTestId('terminate-sess-current')).toBeNull()
  })

  it('shows terminate button on non-current sessions', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByTestId('terminate-sess-2')).toBeTruthy()
    expect(screen.getByTestId('terminate-sess-sus')).toBeTruthy()
  })

  it('shows suspicious badge on suspicious session', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByTestId('suspicious-badge')).toBeTruthy()
    expect(screen.getByText('Unusual location')).toBeTruthy()
  })

  it('shows confirm modal on terminate click', () => {
    render(<ActiveSessionsList />)
    fireEvent.click(screen.getByTestId('terminate-sess-2'))
    expect(screen.getByTestId('confirm-modal')).toBeTruthy()
    expect(screen.getByText(/End this session/)).toBeTruthy()
  })

  it('calls terminate on confirm', () => {
    render(<ActiveSessionsList />)
    fireEvent.click(screen.getByTestId('terminate-sess-2'))
    fireEvent.click(screen.getByTestId('confirm-action-btn'))
    expect(mockTerminate).toHaveBeenCalledWith('sess-2', expect.any(Object))
  })

  it('shows Terminate All button when other sessions exist', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByTestId('terminate-all-btn')).toBeTruthy()
  })

  it('shows confirm modal for terminate all', () => {
    render(<ActiveSessionsList />)
    fireEvent.click(screen.getByTestId('terminate-all-btn'))
    expect(screen.getByText(/All other devices will be logged out/)).toBeTruthy()
  })

  it('parses user agent correctly — Chrome on Windows', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByText('Chrome on Windows')).toBeTruthy()
  })

  it('parses user agent correctly — Safari on macOS', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByText('Safari on macOS')).toBeTruthy()
  })

  it('shows geo info with country', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByText(/Mumbai, IN/)).toBeTruthy()
  })

  it('shows IP addresses', () => {
    render(<ActiveSessionsList />)
    expect(screen.getByText(/203\.0\.113\.42/)).toBeTruthy()
  })
})
