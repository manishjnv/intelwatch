/**
 * @module __tests__/users-honest-ui
 * @description UserManagementPage must show loading/error/empty states per-region via
 * QueryStateView and never fall back to demo rows (S161a honest-UI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { ApiError } from '@/lib/api'

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span data-testid={`stat-${label}`}>{label}: {value}</span>,
}))

function loadingQuery() {
  return { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }
}
function errorQuery(refetch = vi.fn()) {
  return { data: undefined, isLoading: false, isError: true, error: new ApiError(404, 'NOT_FOUND', 'Not Found'), refetch }
}
function dataQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null, refetch: vi.fn() }
}

const USER = {
  id: 'usr-1', name: 'Manish Kumar', email: 'manish@intelwatch.in', role: 'admin',
  team: 'Platform', status: 'active', lastLogin: new Date().toISOString(),
  mfaEnabled: true, createdAt: new Date().toISOString(),
}
const SESSION = {
  id: 'sess-1', userId: 'usr-1', userName: 'Manish Kumar', ip: '72.61.227.64',
  device: 'Chrome / Windows', startedAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(), status: 'active',
}

const mockUseUsers = vi.fn()
const mockUseTeams = vi.fn()
const mockUseRoles = vi.fn()
const mockUseSessions = vi.fn()
const mockUseAuditLog = vi.fn()
const mockUseUserManagementStats = vi.fn()
const mockRevokeSessionMutate = vi.fn()
const mockRevokeAllMutate = vi.fn()

vi.mock('@/hooks/use-phase5-data', () => ({
  useUsers: (...args: any[]) => mockUseUsers(...args),
  useTeams: () => mockUseTeams(),
  useRoles: () => mockUseRoles(),
  useSessions: () => mockUseSessions(),
  useAuditLog: (...args: any[]) => mockUseAuditLog(...args),
  useUserManagementStats: () => mockUseUserManagementStats(),
  useRevokeSession: () => ({ mutate: mockRevokeSessionMutate, isPending: false }),
  useRevokeAllSessions: () => ({ mutate: mockRevokeAllMutate, isPending: false }),
  useInviteUser: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateTeam: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateRole: () => ({ mutate: vi.fn(), isPending: false }),
}))

function setupHappyDefaults() {
  mockUseUsers.mockReturnValue(dataQuery({ data: [USER], total: 1, page: 1, limit: 50 }))
  mockUseTeams.mockReturnValue(dataQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockUseRoles.mockReturnValue(dataQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockUseSessions.mockReturnValue(dataQuery({ data: [SESSION], total: 1, page: 1, limit: 50 }))
  mockUseAuditLog.mockReturnValue(dataQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockUseUserManagementStats.mockReturnValue(dataQuery({ totalUsers: 1, activeSessions: 1, teams: 0, roles: 0, mfaPercent: 100 }))
}

beforeEach(() => {
  vi.clearAllMocks()
  setupHappyDefaults()
})

const DEMO_STRINGS = ['Sarah Chen', 'Priya Sharma', 'Alex Rivera', 'Demo data — connect User Management service']

describe('UserManagementPage — honest UI (no demo fallback)', () => {
  it('shows query-loading while users are loading', () => {
    mockUseUsers.mockReturnValue(loadingQuery())
    render(<UserManagementPage />)
    expect(screen.getByTestId('query-loading')).toBeInTheDocument()
  })

  it('shows query-error with "Couldn\'t load users" + "Not available yet" on 404', () => {
    mockUseUsers.mockReturnValue(errorQuery())
    render(<UserManagementPage />)
    const err = screen.getByTestId('query-error')
    expect(err).toHaveTextContent("Couldn't load users")
    expect(err).toHaveTextContent('Not available yet')
    for (const s of DEMO_STRINGS) expect(screen.queryByText(s)).not.toBeInTheDocument()
  })

  it('Retry on the users error card calls refetch', () => {
    const refetch = vi.fn()
    mockUseUsers.mockReturnValue(errorQuery(refetch))
    render(<UserManagementPage />)
    fireEvent.click(screen.getByTestId('query-retry'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when there are no users', () => {
    mockUseUsers.mockReturnValue(dataQuery({ data: [], total: 0, page: 1, limit: 50 }))
    render(<UserManagementPage />)
    expect(screen.getByText('No users found.')).toBeInTheDocument()
  })

  it('renders real user rows when data resolves', () => {
    render(<UserManagementPage />)
    expect(screen.getByText('Manish Kumar')).toBeInTheDocument()
    expect(screen.getByText('manish@intelwatch.in')).toBeInTheDocument()
  })

  it('stat tiles show — when stats are loading, never a fake 0', () => {
    mockUseUserManagementStats.mockReturnValue(loadingQuery())
    render(<UserManagementPage />)
    expect(screen.getByTestId('stat-Total Users')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-Active Sessions')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-Teams')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-Roles')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-MFA Enabled')).toHaveTextContent('—')
  })

  it('stat tiles show — when stats fail to load', () => {
    mockUseUserManagementStats.mockReturnValue(errorQuery())
    render(<UserManagementPage />)
    expect(screen.getByTestId('stat-Total Users')).toHaveTextContent('—')
  })

  it('revoke-session button is enabled with real session data (no demo guard)', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Sessions'))
    const revokeBtn = screen.getByText('Revoke') as HTMLButtonElement
    expect(revokeBtn.disabled).toBe(false)
    fireEvent.click(revokeBtn)
    expect(mockRevokeSessionMutate).toHaveBeenCalledWith('sess-1')
  })

  it('revoke-all button is enabled with real session data (no demo guard)', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Sessions'))
    const revokeAllBtn = screen.getByText('Revoke All') as HTMLButtonElement
    expect(revokeAllBtn.disabled).toBe(false)
    fireEvent.click(revokeAllBtn)
    expect(mockRevokeAllMutate).toHaveBeenCalled()
  })

  it('sessions tab shows its own error card when only the sessions endpoint fails', () => {
    mockUseSessions.mockReturnValue(errorQuery())
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Sessions'))
    expect(screen.getByTestId('query-error')).toHaveTextContent("Couldn't load user sessions")
    // Users tab data is unaffected — one failing endpoint doesn't blank the page
    fireEvent.click(screen.getByText('Users'))
    expect(screen.getByText('Manish Kumar')).toBeInTheDocument()
  })

  it('audit tab paginates from the real total, not a demo-mode array length', () => {
    mockUseAuditLog.mockReturnValue(dataQuery({
      data: [{ id: 'a1', timestamp: new Date().toISOString(), userName: 'Manish Kumar', action: 'user.login', resource: 'auth', ip: '1.2.3.4', details: 'ok' }],
      total: 137, page: 1, limit: 50,
    }))
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText(/137/)).toBeInTheDocument()
  })
})
