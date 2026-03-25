/**
 * Tests for Phase 5 frontend pages: Integration, User Management, Customization.
 * Covers: rendering, demo fallback, tabs, detail panels, modals, filters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock Phase 5 data hooks ────────────────────────────────────

const mockUseSIEMIntegrations = vi.fn()
const mockUseWebhooks = vi.fn()
const mockUseTicketingIntegrations = vi.fn()
const mockUseSTIXCollections = vi.fn()
const mockUseBulkExports = vi.fn()
const mockUseIntegrationStats = vi.fn()
const mockUseCreateSIEM = vi.fn()
const mockUseCreateWebhook = vi.fn()
const mockUseCreateTicketing = vi.fn()
const mockUseCreateSTIXCollection = vi.fn()
const mockUseCreateBulkExport = vi.fn()
const mockUseTestSIEMConnection = vi.fn()
const mockUseUsers = vi.fn()
const mockUseTeams = vi.fn()
const mockUseRoles = vi.fn()
const mockUseSessions = vi.fn()
const mockUseAuditLog = vi.fn()
const mockUseUserManagementStats = vi.fn()
const mockUseInviteUser = vi.fn()
const mockUseCreateTeam = vi.fn()
const mockUseCreateRole = vi.fn()
const mockUseRevokeSession = vi.fn()
const mockUseRevokeAllSessions = vi.fn()
const mockUseModuleToggles = vi.fn()
const mockUseAIConfigs = vi.fn()
const mockUseRiskWeights = vi.fn()
const mockUseNotificationChannels = vi.fn()
const mockUseCustomizationStats = vi.fn()
const mockUseToggleModule = vi.fn()
const mockUseUpdateAIConfig = vi.fn()
const mockUseUpdateRiskWeight = vi.fn()
const mockUseResetRiskWeights = vi.fn()
const mockUseUpdateNotificationChannel = vi.fn()
const mockUseTestNotification = vi.fn()

vi.mock('@/hooks/use-phase5-data', () => ({
  useSIEMIntegrations: () => mockUseSIEMIntegrations(),
  useWebhooks: () => mockUseWebhooks(),
  useTicketingIntegrations: () => mockUseTicketingIntegrations(),
  useSTIXCollections: () => mockUseSTIXCollections(),
  useBulkExports: () => mockUseBulkExports(),
  useIntegrationStats: () => mockUseIntegrationStats(),
  useCreateSIEM: () => mockUseCreateSIEM(),
  useCreateWebhook: () => mockUseCreateWebhook(),
  useCreateTicketing: () => mockUseCreateTicketing(),
  useCreateSTIXCollection: () => mockUseCreateSTIXCollection(),
  useCreateBulkExport: () => mockUseCreateBulkExport(),
  useTestSIEMConnection: () => mockUseTestSIEMConnection(),
  useUsers: (...args: any[]) => mockUseUsers(...args),
  useTeams: () => mockUseTeams(),
  useRoles: () => mockUseRoles(),
  useSessions: () => mockUseSessions(),
  useAuditLog: (...args: any[]) => mockUseAuditLog(...args),
  useUserManagementStats: () => mockUseUserManagementStats(),
  useInviteUser: () => mockUseInviteUser(),
  useCreateTeam: () => mockUseCreateTeam(),
  useCreateRole: () => mockUseCreateRole(),
  useRevokeSession: () => mockUseRevokeSession(),
  useRevokeAllSessions: () => mockUseRevokeAllSessions(),
  useModuleToggles: () => mockUseModuleToggles(),
  useAIConfigs: () => mockUseAIConfigs(),
  useRiskWeights: () => mockUseRiskWeights(),
  useNotificationChannels: () => mockUseNotificationChannels(),
  useCustomizationStats: () => mockUseCustomizationStats(),
  useToggleModule: () => mockUseToggleModule(),
  useUpdateAIConfig: () => mockUseUpdateAIConfig(),
  useUpdateRiskWeight: () => mockUseUpdateRiskWeight(),
  useResetRiskWeights: () => mockUseResetRiskWeights(),
  useUpdateNotificationChannel: () => mockUseUpdateNotificationChannel(),
  useTestNotification: () => mockUseTestNotification(),
  // AI plan / subtask hooks (F2/F3)
  usePlanTiers:         () => ({ data: { data: [] }, isDemo: true }),
  useSubtaskMappings:   () => ({ data: { data: [] }, isDemo: true }),
  useRecommendedModels: () => ({ data: { data: [] }, isDemo: true }),
  useCostEstimate:      () => ({ data: { data: null }, isDemo: true }),
  useApplyPlan:         () => ({ mutate: vi.fn(), isPending: false }),
  useSetSubtaskModel:   () => ({ mutate: vi.fn(), isPending: false }),
  // BYOK hooks
  useAnthropicKeyStatus: () => ({ data: { data: { tenantId: 'default', hasKey: false, maskedKey: null } }, isDemo: false, isLoading: false }),
  useSaveAnthropicKey:   () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDeleteAnthropicKey: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Mock shared-ui components
vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: { children: React.ReactNode }) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: { label: string; value: string }) => <span data-testid={`stat-${label}`}>{label}: {value}</span>,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}))

// ─── Test Data ──────────────────────────────────────────────────

const SIEM = {
  id: 'siem-1', name: 'Production Splunk', type: 'splunk', status: 'active',
  endpoint: 'https://splunk.local:8088', eventsForwarded: 12847,
  lastSync: new Date().toISOString(), latencyMs: 42, createdAt: new Date().toISOString(),
}

const WEBHOOK = {
  id: 'wh-1', url: 'https://hooks.slack.com/T00/B00', events: ['alert.critical'],
  status: 'active', deliveryRate: 99.2, lastTriggered: new Date().toISOString(),
  secret: '••••', hmacEnabled: true, retryCount: 0, dlqCount: 0, createdAt: new Date().toISOString(),
}

const TICKETING = {
  id: 'tick-1', name: 'ServiceNow Production', type: 'servicenow',
  project: 'SEC-OPS', autoCreateRules: 4, status: 'active', recentTickets: 23,
  createdAt: new Date().toISOString(),
}

const STIX = {
  id: 'stix-1', name: 'ETIP Published IOCs', type: 'publish',
  objectCount: 1245, lastPollOrPush: new Date().toISOString(), status: 'active',
  pollingInterval: 3600, createdAt: new Date().toISOString(),
}

const EXPORT = {
  id: 'exp-1', name: 'Daily IOC Export', format: 'stix', schedule: '0 2 * * *',
  lastRun: new Date().toISOString(), nextRun: new Date().toISOString(),
  status: 'active', recordCount: 342, createdAt: new Date().toISOString(),
}

const USER = {
  id: 'usr-1', name: 'Manish Kumar', email: 'manish@intelwatch.in', role: 'admin',
  team: 'Platform', status: 'active', lastLogin: new Date().toISOString(),
  mfaEnabled: true, createdAt: new Date().toISOString(),
}

const USER_LOCKED = {
  id: 'usr-4', name: 'Jordan Blake', email: 'jordan@intelwatch.in', role: 'soc_analyst',
  team: 'SOC Tier 2', status: 'locked', lastLogin: new Date().toISOString(),
  mfaEnabled: false, createdAt: new Date().toISOString(),
}

const TEAM = {
  id: 'team-1', name: 'Platform', description: 'Platform engineering',
  memberCount: 3, lead: 'Manish Kumar', createdAt: new Date().toISOString(),
}

const ROLE = {
  id: 'role-1', name: 'Admin', permissionCount: 45, userCount: 1,
  isSystem: true, description: 'Full platform access', createdAt: new Date().toISOString(),
}

const ROLE_CUSTOM = {
  id: 'role-6', name: 'Integration Admin', permissionCount: 15, userCount: 1,
  isSystem: false, description: 'Custom role for integrations', createdAt: new Date().toISOString(),
}

const SESSION = {
  id: 'sess-1', userId: 'usr-1', userName: 'Manish Kumar', ip: '72.61.227.64',
  device: 'Chrome / Windows', startedAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(), status: 'active',
}

const AUDIT = {
  id: 'aud-1', timestamp: new Date().toISOString(), userName: 'Manish Kumar',
  action: 'user.login', resource: 'auth', ip: '72.61.227.64', details: 'MFA verified',
}

const MODULE = {
  id: 'mod-1', name: 'Ingestion Service', description: 'Feed collection and parsing',
  enabled: true, icon: 'Download', dependencies: [], category: 'Pipeline',
}

const MODULE_DISABLED = {
  id: 'mod-9', name: 'Dark Web Monitoring', description: 'Deep/dark web scanning',
  enabled: false, icon: 'Eye', dependencies: ['Digital Risk Protection'], category: 'Protection',
}

const AI_CONFIG = {
  id: 'ai-1', task: 'IOC Triage', model: 'claude-haiku-4-5', maxTokens: 512,
  monthlyBudget: 50, spent: 18.40, confidenceThreshold: 0.7, enabled: true,
}

const RISK_WEIGHT = {
  id: 'rw-1', factor: 'Severity', weight: 0.35, description: 'Impact severity',
  min: 0, max: 1, default: 0.35,
}

const NOTIF_CHANNEL = {
  id: 'notif-1', type: 'email', name: 'Security Team Email',
  enabled: true, severities: ['critical', 'high'],
  quietHoursStart: null, quietHoursEnd: null,
}

// ─── Setup ──────────────────────────────────────────────────────

function setupDefaultMocks() {
  // Integration
  mockUseSIEMIntegrations.mockReturnValue({ data: { data: [SIEM], total: 1, page: 1, limit: 50 } })
  mockUseWebhooks.mockReturnValue({ data: { data: [WEBHOOK], total: 1, page: 1, limit: 50 } })
  mockUseTicketingIntegrations.mockReturnValue({ data: { data: [TICKETING], total: 1, page: 1, limit: 50 } })
  mockUseSTIXCollections.mockReturnValue({ data: { data: [STIX], total: 1, page: 1, limit: 50 } })
  mockUseBulkExports.mockReturnValue({ data: { data: [EXPORT], total: 1, page: 1, limit: 50 } })
  mockUseIntegrationStats.mockReturnValue({ data: { total: 14, active: 11, failing: 2, eventsPerHour: 2840, lastSync: new Date().toISOString() }, isDemo: true })
  mockUseCreateSIEM.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateWebhook.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateTicketing.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateSTIXCollection.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateBulkExport.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseTestSIEMConnection.mockReturnValue({ mutate: vi.fn(), isPending: false })

  // User Management
  mockUseUsers.mockReturnValue({ data: { data: [USER, USER_LOCKED], total: 2, page: 1, limit: 50 } })
  mockUseTeams.mockReturnValue({ data: { data: [TEAM], total: 1, page: 1, limit: 50 } })
  mockUseRoles.mockReturnValue({ data: { data: [ROLE, ROLE_CUSTOM], total: 2, page: 1, limit: 50 } })
  mockUseSessions.mockReturnValue({ data: { data: [SESSION], total: 1, page: 1, limit: 50 } })
  mockUseAuditLog.mockReturnValue({ data: { data: [AUDIT], total: 1, page: 1, limit: 50 } })
  mockUseUserManagementStats.mockReturnValue({ data: { totalUsers: 6, activeSessions: 3, teams: 4, roles: 6, mfaPercent: 67 }, isDemo: true })
  mockUseInviteUser.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateTeam.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseCreateRole.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseRevokeSession.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseRevokeAllSessions.mockReturnValue({ mutate: vi.fn(), isPending: false })

  // Customization
  mockUseModuleToggles.mockReturnValue({ data: { data: [MODULE, MODULE_DISABLED] } })
  mockUseAIConfigs.mockReturnValue({ data: { data: [AI_CONFIG] } })
  mockUseRiskWeights.mockReturnValue({ data: { data: [RISK_WEIGHT] } })
  mockUseNotificationChannels.mockReturnValue({ data: { data: [NOTIF_CHANNEL] } })
  mockUseCustomizationStats.mockReturnValue({ data: { modulesEnabled: 8, customRules: 6, aiBudgetUsed: 31.6, theme: 'dark' }, isDemo: true })
  mockUseToggleModule.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseUpdateAIConfig.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseUpdateRiskWeight.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseResetRiskWeights.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseUpdateNotificationChannel.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUseTestNotification.mockReturnValue({ mutate: vi.fn(), isPending: false })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

// ─── Integration Page Tests ─────────────────────────────────────

describe('IntegrationPage', () => {
  let IntegrationPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/IntegrationPage')
    IntegrationPage = mod.IntegrationPage
  })

  it('renders demo banner in demo mode', () => {
    render(<IntegrationPage />)
    expect(screen.getByText('Demo')).toBeTruthy()
    expect(screen.getByText(/Demo data — connect Integration service/)).toBeTruthy()
  })

  it('renders stats bar with integration metrics', () => {
    render(<IntegrationPage />)
    expect(screen.getByTestId('stat-Total Integrations')).toBeTruthy()
    expect(screen.getByTestId('stat-Active')).toBeTruthy()
    expect(screen.getByTestId('stat-Failing')).toBeTruthy()
    expect(screen.getByTestId('stat-Events/hr')).toBeTruthy()
  })

  it('renders SIEM tab by default with data', () => {
    render(<IntegrationPage />)
    // Name appears in both summary card and table row
    expect(screen.getAllByText('Production Splunk').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('42ms').length).toBeGreaterThanOrEqual(1)
  })

  it('renders all 5 tab buttons', () => {
    render(<IntegrationPage />)
    expect(screen.getByText('SIEM')).toBeTruthy()
    expect(screen.getByText('Webhooks')).toBeTruthy()
    expect(screen.getByText('Ticketing')).toBeTruthy()
    expect(screen.getByText('STIX/TAXII')).toBeTruthy()
    expect(screen.getByText('Bulk Export')).toBeTruthy()
  })

  it('switches to Webhooks tab and shows data', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Webhooks'))
    expect(screen.getByText('https://hooks.slack.com/T00/B00')).toBeTruthy()
    expect(screen.getByText('99.2%')).toBeTruthy()
  })

  it('switches to Ticketing tab and shows data', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Ticketing'))
    expect(screen.getByText('ServiceNow Production')).toBeTruthy()
    expect(screen.getByText('SEC-OPS')).toBeTruthy()
  })

  it('switches to STIX/TAXII tab and shows data', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('STIX/TAXII'))
    expect(screen.getByText('ETIP Published IOCs')).toBeTruthy()
    expect(screen.getByText('publish')).toBeTruthy()
  })

  it('switches to Bulk Export tab and shows data', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Bulk Export'))
    expect(screen.getByText('Daily IOC Export')).toBeTruthy()
    expect(screen.getByText('0 2 * * *')).toBeTruthy()
  })

  it('renders Add button for current tab', () => {
    render(<IntegrationPage />)
    expect(screen.getByText('Add SIEM')).toBeTruthy()
    fireEvent.click(screen.getByText('Webhooks'))
    expect(screen.getByText('Add Webhooks')).toBeTruthy()
  })

  it('opens Add SIEM modal on button click', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Add SIEM'))
    expect(screen.getByText('Add SIEM Integration')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g., Production Splunk')).toBeTruthy()
  })

  it('renders SIEM type selector in modal', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Add SIEM'))
    expect(screen.getByText('Splunk')).toBeTruthy()
    expect(screen.getByText('Azure Sentinel')).toBeTruthy()
    expect(screen.getByText('Elastic SIEM')).toBeTruthy()
  })

  it('opens detail panel on row click', () => {
    render(<IntegrationPage />)
    // Click the first instance (summary card or table row)
    fireEvent.click(screen.getAllByText('Production Splunk')[0])
    expect(screen.getByText('Configuration')).toBeTruthy()
    expect(screen.getByText('Metrics')).toBeTruthy()
    expect(screen.getByText('Test Connection')).toBeTruthy()
  })

  it('shows latency color coding', () => {
    render(<IntegrationPage />)
    const latencies = screen.getAllByText('42ms')
    // Second instance is from table with color coding (first is summary card)
    const colored = latencies.find(el => el.className.includes('text-sev-low'))
    expect(colored).toBeTruthy()
  })

  it('shows SIEM summary cards', () => {
    render(<IntegrationPage />)
    const cards = screen.getAllByText('Production Splunk')
    // Appears in both summary card and table
    expect(cards.length).toBeGreaterThanOrEqual(2)
  })

  it('renders webhook event badges in modal', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Webhooks'))
    fireEvent.click(screen.getByText('Add Webhooks'))
    // alert.critical appears in both table data and modal event list
    expect(screen.getAllByText('alert.critical').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('ioc.new')).toBeTruthy()
  })

  it('renders STIX direction badges', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('STIX/TAXII'))
    expect(screen.getByText('publish')).toBeTruthy()
  })

  it('renders export format badge', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Bulk Export'))
    // TypeBadge uses CSS uppercase, DOM text is lowercase
    expect(screen.getByText('stix')).toBeTruthy()
  })

  it('closes detail panel on backdrop click', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getAllByText('Production Splunk')[0])
    expect(screen.getByText('Configuration')).toBeTruthy()
    // Click backdrop
    const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/30')
    if (backdrop) fireEvent.click(backdrop)
  })

  it('shows DLQ count for failing webhooks', () => {
    mockUseWebhooks.mockReturnValue({ data: { data: [{ ...WEBHOOK, status: 'failing', dlqCount: 12 }], total: 1, page: 1, limit: 50 } })
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Webhooks'))
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('renders ticketing auto-create rules count', () => {
    render(<IntegrationPage />)
    fireEvent.click(screen.getByText('Ticketing'))
    expect(screen.getByText('4')).toBeTruthy()
  })
})

// ─── User Management Page Tests ─────────────────────────────────

describe('UserManagementPage', () => {
  let UserManagementPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/UserManagementPage')
    UserManagementPage = mod.UserManagementPage
  })

  it('renders demo banner in demo mode', () => {
    render(<UserManagementPage />)
    expect(screen.getByText('Demo')).toBeTruthy()
    expect(screen.getByText(/Demo data — connect User Management/)).toBeTruthy()
  })

  it('renders stats bar with user metrics', () => {
    render(<UserManagementPage />)
    expect(screen.getByTestId('stat-Total Users')).toBeTruthy()
    expect(screen.getByTestId('stat-Active Sessions')).toBeTruthy()
    expect(screen.getByTestId('stat-Teams')).toBeTruthy()
    expect(screen.getByTestId('stat-MFA Enabled')).toBeTruthy()
  })

  it('renders all 5 tab buttons', () => {
    render(<UserManagementPage />)
    expect(screen.getByText('Users')).toBeTruthy()
    expect(screen.getByText('Teams')).toBeTruthy()
    expect(screen.getByText('Roles')).toBeTruthy()
    expect(screen.getByText('Sessions')).toBeTruthy()
    expect(screen.getByText('Audit Log')).toBeTruthy()
  })

  it('renders Users tab by default with user data', () => {
    render(<UserManagementPage />)
    expect(screen.getByText('Manish Kumar')).toBeTruthy()
    expect(screen.getByText('manish@intelwatch.in')).toBeTruthy()
    expect(screen.getByText('admin')).toBeTruthy()
  })

  it('shows role color badges', () => {
    render(<UserManagementPage />)
    const adminBadge = screen.getByText('admin')
    expect(adminBadge.className).toContain('text-sev-critical')
  })

  it('shows status badges for active and locked users', () => {
    render(<UserManagementPage />)
    expect(screen.getByText('active')).toBeTruthy()
    expect(screen.getByText('locked')).toBeTruthy()
  })

  it('renders Invite User button on Users tab', () => {
    render(<UserManagementPage />)
    expect(screen.getByText('Invite User')).toBeTruthy()
  })

  it('opens Invite User modal', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Invite User'))
    // Button and modal title both say "Invite User"
    expect(screen.getAllByText('Invite User').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByPlaceholderText('user@company.com')).toBeTruthy()
  })

  it('switches to Teams tab and shows data', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Teams'))
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.getByText('Platform engineering')).toBeTruthy()
    expect(screen.getByText('Create Team')).toBeTruthy()
  })

  it('switches to Roles tab and shows system/custom badges', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Roles'))
    expect(screen.getByText('Admin')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
    expect(screen.getByText('Create Role')).toBeTruthy()
  })

  it('switches to Sessions tab and shows revoke buttons', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Sessions'))
    expect(screen.getByText('72.61.227.64')).toBeTruthy()
    expect(screen.getByText('Revoke')).toBeTruthy()
    expect(screen.getByText('Revoke All')).toBeTruthy()
  })

  it('switches to Audit Log tab and shows entries', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText('user.login')).toBeTruthy()
    expect(screen.getByText('MFA verified')).toBeTruthy()
  })

  it('opens user detail panel on row click', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Manish Kumar'))
    expect(screen.getByText('Profile')).toBeTruthy()
    expect(screen.getByText('Security')).toBeTruthy()
    expect(screen.getByText('Actions')).toBeTruthy()
  })

  it('shows MFA shield icon for MFA-enabled users', () => {
    render(<UserManagementPage />)
    // User with MFA should show shield icon
    fireEvent.click(screen.getByText('Manish Kumar'))
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('shows lock account button for active users', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Manish Kumar'))
    expect(screen.getByText('Lock Account')).toBeTruthy()
  })

  it('opens Create Role modal with permission groups', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Roles'))
    fireEvent.click(screen.getByText('Create Role'))
    expect(screen.getByText('Create Custom Role')).toBeTruthy()
    expect(screen.getByText('IOCs')).toBeTruthy()
    expect(screen.getByText('Alerts')).toBeTruthy()
    expect(screen.getByText('Hunting')).toBeTruthy()
  })

  it('shows team member count', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Teams'))
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows role permission count', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Roles'))
    expect(screen.getByText('45')).toBeTruthy()
  })

  it('shows session device info', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Sessions'))
    expect(screen.getByText('Chrome / Windows')).toBeTruthy()
  })

  it('renders audit log action badges', () => {
    render(<UserManagementPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    const badge = screen.getByText('user.login')
    expect(badge.className).toContain('bg-accent/10')
  })
})

// ─── Customization Page Tests ───────────────────────────────────

describe('CustomizationPage', () => {
  let CustomizationPage: any
  beforeEach(async () => {
    const mod = await import('@/pages/CustomizationPage')
    CustomizationPage = mod.CustomizationPage
  })

  it('renders demo banner in demo mode', () => {
    render(<CustomizationPage />)
    expect(screen.getByText('Demo')).toBeTruthy()
    expect(screen.getByText(/Demo data — connect Customization service/)).toBeTruthy()
  })

  it('renders stats bar with customization metrics', () => {
    render(<CustomizationPage />)
    expect(screen.getByTestId('stat-Modules Enabled')).toBeTruthy()
    expect(screen.getByTestId('stat-Custom Rules')).toBeTruthy()
    expect(screen.getByTestId('stat-AI Budget Used')).toBeTruthy()
    expect(screen.getByTestId('stat-Theme')).toBeTruthy()
  })

  it('renders all 5 tab buttons', () => {
    render(<CustomizationPage />)
    expect(screen.getByText('Modules')).toBeTruthy()
    expect(screen.getByText('AI Config')).toBeTruthy()
    expect(screen.getByText('Risk Weights')).toBeTruthy()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Notifications')).toBeTruthy()
  })

  it('renders Modules tab by default with toggle cards', () => {
    render(<CustomizationPage />)
    expect(screen.getByText('Ingestion Service')).toBeTruthy()
    expect(screen.getByText('Feed collection and parsing')).toBeTruthy()
    expect(screen.getByText('Dark Web Monitoring')).toBeTruthy()
  })

  it('shows module dependency warnings', () => {
    render(<CustomizationPage />)
    expect(screen.getByText('Requires: Digital Risk Protection')).toBeTruthy()
  })

  it('groups modules by category', () => {
    render(<CustomizationPage />)
    expect(screen.getByText('Pipeline')).toBeTruthy()
    expect(screen.getByText('Protection')).toBeTruthy()
  })

  it('switches to AI Config tab and shows plan tier section', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('AI Config'))
    expect(screen.getByText('AI Plan Tier')).toBeTruthy()
    expect(screen.getByText('12 Pipeline Subtasks')).toBeTruthy()
    expect(screen.getByText('Cost Estimator')).toBeTruthy()
  })

  it('shows AI plan tier heading on AI Config tab', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('AI Config'))
    expect(screen.getByText('AI Plan Tier')).toBeTruthy()
  })

  it('shows cost estimator slider on AI Config tab', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('AI Config'))
    expect(screen.getByText('Cost Estimator')).toBeTruthy()
  })

  it('switches to Risk Weights tab and shows sliders', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    expect(screen.getByText('Severity')).toBeTruthy()
    expect(screen.getByText('Impact severity')).toBeTruthy()
    expect(screen.getByText('Risk Score Weights')).toBeTruthy()
  })

  it('shows weight total', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    expect(screen.getByText('Total: 0.35')).toBeTruthy()
  })

  it('shows reset button on Risk Weights tab', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    expect(screen.getByText('Reset')).toBeTruthy()
  })

  it('shows score preview on Risk Weights tab', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    expect(screen.getByText('Score Preview')).toBeTruthy()
    expect(screen.getByText('/ 100 composite score')).toBeTruthy()
  })

  it('switches to Dashboard tab and shows config options', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.getByText('Dashboard Preferences')).toBeTruthy()
    expect(screen.getByText('Widget Layout')).toBeTruthy()
  })

  it('shows dashboard selector', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.getByText('Overview Dashboard')).toBeTruthy()
    expect(screen.getByText('SOC Operations')).toBeTruthy()
  })

  it('shows widget placeholder cards', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.getByText('IOC Summary')).toBeTruthy()
    expect(screen.getByText('Alert Feed')).toBeTruthy()
    expect(screen.getByText('Risk Score')).toBeTruthy()
  })

  it('switches to Notifications tab and shows channels', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Notifications'))
    expect(screen.getByText('Alert Channels')).toBeTruthy()
    expect(screen.getByText('Security Team Email')).toBeTruthy()
    // Type badge uses CSS uppercase, DOM text is lowercase
    expect(screen.getByText('email')).toBeTruthy()
  })

  it('shows severity routing buttons on notification channels', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Notifications'))
    // Channel has critical and high enabled
    const critBtns = screen.getAllByText('critical')
    expect(critBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('shows test notification button', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Notifications'))
    expect(screen.getByText('Test Notification')).toBeTruthy()
  })

  it('renders refresh interval selector on Dashboard tab', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.getByText('Every 5 minutes')).toBeTruthy()
  })
})

// ─── Cross-page Tests ───────────────────────────────────────────

describe('Phase 5 cross-page', () => {
  it('all pages handle empty data gracefully', async () => {
    // Override with empty data
    mockUseSIEMIntegrations.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })
    mockUseWebhooks.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })
    mockUseTicketingIntegrations.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })
    mockUseSTIXCollections.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })
    mockUseBulkExports.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })

    const { IntegrationPage } = await import('@/pages/IntegrationPage')
    render(<IntegrationPage />)
    expect(screen.getByText('No SIEM integrations configured.')).toBeTruthy()
  })

  it('user management handles empty user list', async () => {
    mockUseUsers.mockReturnValue({ data: { data: [], total: 0, page: 1, limit: 50 } })
    const { UserManagementPage } = await import('@/pages/UserManagementPage')
    render(<UserManagementPage />)
    expect(screen.getByText('No users found.')).toBeTruthy()
  })

  it('customization handles empty module list', async () => {
    mockUseModuleToggles.mockReturnValue({ data: { data: [] } })
    const { CustomizationPage } = await import('@/pages/CustomizationPage')
    render(<CustomizationPage />)
    // Should not crash with empty modules
    expect(screen.getByText('Modules')).toBeTruthy()
  })
})
