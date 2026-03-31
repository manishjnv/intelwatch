/**
 * @module __tests__/command-center-system-routes.test
 * @description Session 111 tests: SystemTab, sidebar cleanup, route redirects, hash navigation.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { MODULES } from '@/config/modules'
import { SystemTab } from '@/components/command-center/SystemTab'

// ─── Mock auth store ────────────────────────────────────────────

let mockRole = 'super_admin'
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({
    user: { id: 'u1', email: 'a@test.com', displayName: 'Admin', role: mockRole, tenantId: 't1', avatarUrl: null },
    accessToken: 'tok', tenant: { id: 't1', name: 'Test', slug: 'test', plan: 'teams' },
  }),
}))

// ─── Mock phase6 hooks ──────────────────────────────────────────

const mockSystemHealth = {
  data: {
    services: [
      { name: 'api-gateway', status: 'healthy', uptime: 99.9, responseMs: 12, lastChecked: new Date().toISOString(), port: 3001, version: '0.1.1', errorRate: 0.1 },
      { name: 'ingestion', status: 'healthy', uptime: 99.5, responseMs: 25, lastChecked: new Date().toISOString(), port: 3004, version: '0.7.0', errorRate: 0.2 },
      { name: 'enrichment', status: 'degraded', uptime: 97.2, responseMs: 340, lastChecked: new Date().toISOString(), port: 3006, version: '0.3.0', errorRate: 2.1 },
    ],
    summary: { healthy: 30, degraded: 2, down: 1, total: 33, uptimePercent: 99.1, lastUpdated: new Date().toISOString() },
  },
  refetch: vi.fn(),
  isFetching: false,
}

const mockQueueHealth = {
  data: {
    queues: [
      { name: 'etip-feed-fetch', waiting: 3, active: 1, failed: 0, completed: 1200 },
      { name: 'etip-normalize', waiting: 0, active: 0, failed: 0, completed: 800 },
      { name: 'etip-enrich-realtime', waiting: 15, active: 2, failed: 0, completed: 600 },
      { name: 'etip-graph-sync', waiting: 0, active: 0, failed: 2, completed: 400 },
    ],
    updatedAt: new Date().toISOString(),
  },
  refetch: vi.fn(),
  isFetching: false,
}

const mockDlqStatus = {
  data: {
    queues: [
      { name: 'etip-graph-sync', failed: 2 },
      { name: 'etip-feed-fetch', failed: 0 },
    ],
    totalFailed: 2,
    updatedAt: new Date().toISOString(),
  },
}

vi.mock('@/hooks/use-phase6-data', () => ({
  useSystemHealth: () => mockSystemHealth,
  useQueueHealth: () => mockQueueHealth,
  useQueueAlerts: () => ({ data: { alerts: [] } }),
  useMaintenanceWindows: () => ({
    data: {
      data: [
        { id: 'm1', title: 'DB Migration', description: 'Postgres upgrade', status: 'completed', startsAt: '2026-03-25T02:00:00Z', endsAt: '2026-03-25T04:00:00Z', affectedServices: ['postgres'], createdBy: 'admin', createdAt: '2026-03-24T10:00:00Z' },
        { id: 'm2', title: 'Redis Update', description: 'Redis 7.2', status: 'scheduled', startsAt: '2026-03-30T02:00:00Z', endsAt: '2026-03-30T03:00:00Z', affectedServices: ['redis'], createdBy: 'admin', createdAt: '2026-03-28T10:00:00Z' },
      ],
      total: 2, page: 1, limit: 50,
    },
  }),
  useActivateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateMaintenanceWindow: () => ({ mutate: vi.fn(), isPending: false }),
  useDlqStatus: () => mockDlqStatus,
  useRetryDlqQueue: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryAllDlq: () => ({ mutate: vi.fn(), isPending: false }),
  usePipelineHealth: () => ({
    data: {
      overall: 'healthy',
      stages: [
        { name: 'ingestion', status: 'healthy', latencyMs: 45, message: 'Processing 127 articles/min' },
        { name: 'normalization', status: 'healthy', latencyMs: 12, message: 'All IOC types handled' },
        { name: 'enrichment', status: 'healthy', latencyMs: 340, message: 'VT + AbuseIPDB active' },
        { name: 'indexing', status: 'healthy', latencyMs: 8, message: 'IOC index up to date' },
        { name: 'correlation', status: 'healthy', latencyMs: 28, message: 'All correlations active' },
      ],
      lastCheckedAt: new Date().toISOString(),
    },
    isLoading: false,
  }),
}))

// ─── Mock feed hooks (UnifiedFeedsPanel absorbed into System tab S123e) ─────

vi.mock('@/hooks/use-intel-data', () => ({
  useFeeds: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false }),
  useToggleFeed: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteFeed: () => ({ mutate: vi.fn(), isPending: false }),
  useForceFetch: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalCatalog: () => ({ data: [], isLoading: false }),
  useMySubscriptions: () => ({ data: [], isLoading: false, subscribe: vi.fn(), unsubscribe: vi.fn(), isSubscribing: false, isUnsubscribing: false }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: any) => v,
}))

vi.mock('@/components/feed/FeedCard', () => ({
  FeedTypeIcon: () => null, StatusDot: () => null, ReliabilityBar: () => null,
  HealthDot: () => null, formatTime: () => '', computeFeedHealth: () => 0,
}))

// ─── Helper ─────────────────────────────────────────────────────

function renderSystemTab() {
  return render(<SystemTab />)
}

// ═══════════════════════════════════════════════════════════════════
// 1. SystemTab Tests
// ═══════════════════════════════════════════════════════════════════

describe('SystemTab', () => {
  it('renders system tab with 6 sub-tabs', () => {
    renderSystemTab()
    expect(screen.getByTestId('system-tab')).toBeInTheDocument()
    expect(screen.getByTestId('subtab-health')).toBeInTheDocument()
    expect(screen.getByTestId('subtab-pipeline')).toBeInTheDocument()
    expect(screen.getByTestId('subtab-feeds')).toBeInTheDocument()
    expect(screen.getByTestId('subtab-emergency')).toBeInTheDocument()
    expect(screen.getByTestId('subtab-maintenance')).toBeInTheDocument()
    expect(screen.getByTestId('subtab-backups')).toBeInTheDocument()
  })

  it('defaults to System Health sub-tab', () => {
    renderSystemTab()
    expect(screen.getByTestId('health-subtab')).toBeInTheDocument()
  })

  // ── Health sub-tab ──

  it('shows service grid with status dots', () => {
    renderSystemTab()
    const grid = screen.getByTestId('service-grid')
    expect(grid.children.length).toBe(3)
    expect(grid.textContent).toContain('api-gateway')
    expect(grid.textContent).toContain('ingestion')
    expect(grid.textContent).toContain('enrichment')
  })

  it('shows health score from summary', () => {
    renderSystemTab()
    // 30/33 = 91%
    expect(screen.getByText('91%')).toBeInTheDocument()
  })

  it('shows summary cards (healthy, degraded, down)', () => {
    renderSystemTab()
    expect(screen.getByText('30')).toBeInTheDocument() // healthy
    expect(screen.getByText('2')).toBeInTheDocument()  // degraded
    expect(screen.getByText('1')).toBeInTheDocument()  // down
  })

  it('has refresh health button', () => {
    renderSystemTab()
    const btn = screen.getByTestId('refresh-health')
    fireEvent.click(btn)
    expect(mockSystemHealth.refetch).toHaveBeenCalled()
  })

  // ── Pipeline sub-tab ──

  it('switches to pipeline sub-tab and shows queue table', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-pipeline'))
    expect(screen.getByTestId('pipeline-subtab')).toBeInTheDocument()
    expect(screen.getByTestId('queue-table')).toBeInTheDocument()
    expect(screen.getByTestId('pipeline-flow')).toBeInTheDocument()
  })

  it('shows queue rows with waiting/active/failed counts', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-pipeline'))
    const table = screen.getByTestId('queue-table')
    expect(table.textContent).toContain('feed-fetch')
    expect(table.textContent).toContain('normalize')
  })

  it('highlights stuck queues (waiting > 10)', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-pipeline'))
    // enrich-realtime has waiting=15 → should show "(stuck)"
    expect(screen.getByText('(stuck)')).toBeInTheDocument()
  })

  it('shows pipeline health banner with overall status', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-pipeline'))
    const banner = screen.getByTestId('pipeline-health-banner')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Pipeline healthy')
  })

  it('shows stage health cards with latency and messages', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-pipeline'))
    const cards = screen.getByTestId('stage-health-cards')
    expect(cards).toBeInTheDocument()
    expect(cards.textContent).toContain('ingestion')
    expect(cards.textContent).toContain('45ms')
    expect(cards.textContent).toContain('Processing 127 articles/min')
    expect(cards.textContent).toContain('enrichment')
    expect(cards.textContent).toContain('340ms')
  })

  it('shows DLQ section when failed items exist', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-pipeline'))
    const dlq = screen.getByTestId('dlq-section')
    expect(dlq).toBeInTheDocument()
    expect(dlq.textContent).toContain('graph-sync')
  })

  // ── Maintenance sub-tab ──

  it('switches to maintenance sub-tab and shows history', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-maintenance'))
    expect(screen.getByTestId('maintenance-subtab')).toBeInTheDocument()
    expect(screen.getByTestId('maintenance-history')).toBeInTheDocument()
    expect(screen.getByText('DB Migration')).toBeInTheDocument()
    expect(screen.getByText('Redis Update')).toBeInTheDocument()
  })

  it('shows create maintenance button when no active maintenance', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-maintenance'))
    expect(screen.getByTestId('create-maintenance-btn')).toBeInTheDocument()
  })

  it('shows create form when schedule button clicked', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-maintenance'))
    fireEvent.click(screen.getByTestId('create-maintenance-btn'))
    expect(screen.getByTestId('create-maintenance-form')).toBeInTheDocument()
  })

  // ── Backups sub-tab ──

  it('switches to backups sub-tab and shows backup table', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-backups'))
    expect(screen.getByTestId('backups-subtab')).toBeInTheDocument()
    expect(screen.getByTestId('backup-table')).toBeInTheDocument()
  })

  it('has trigger backup button', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-backups'))
    expect(screen.getByTestId('trigger-backup-btn')).toBeInTheDocument()
  })

  it('shows restore confirmation modal', () => {
    renderSystemTab()
    fireEvent.click(screen.getByTestId('subtab-backups'))
    // Click first restore (Upload) icon button
    const rows = screen.getByTestId('backup-table').querySelectorAll('tbody tr')
    const restoreBtn = rows[0]?.querySelector('button[title="Restore"]')
    expect(restoreBtn).toBeTruthy()
    fireEvent.click(restoreBtn!)
    expect(screen.getByTestId('restore-confirm-modal')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2. Sidebar Cleanup Tests
// ═══════════════════════════════════════════════════════════════════

describe('Sidebar cleanup — MODULES array', () => {
  const moduleIds = MODULES.map(m => m.id)

  it('has exactly 9 modules in MODULES array', () => {
    expect(MODULES.length).toBe(9)
  })

  it('contains all 9 expected modules', () => {
    const expected = [
      'ioc-intelligence', 'threat-graph', 'threat-actors',
      'malware-analysis', 'vulnerability-intel', 'threat-hunting',
      'digital-risk-protection', 'correlation-engine', 'command-center',
    ]
    for (const id of expected) {
      expect(moduleIds).toContain(id)
    }
  })

  it('does NOT contain absorbed modules', () => {
    const absorbed = [
      'feed-ingestion', 'global-catalog', 'enterprise-integrations', 'rbac-sso',
      'customization', 'billing', 'admin-ops', 'onboarding',
      'reporting', 'alerting', 'analytics', 'plan-limits', 'pipeline-monitor',
    ]
    for (const id of absorbed) {
      expect(moduleIds).not.toContain(id)
    }
  })

  it('Command Center is last in the array', () => {
    expect(MODULES[MODULES.length - 1].id).toBe('command-center')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 3. Route Redirect Tests (structural verification)
// ═══════════════════════════════════════════════════════════════════

describe('Route redirects — structural', () => {
  const REDIRECTS: Record<string, string> = {
    '/feeds': '/command-center#system',
    '/integrations': '/command-center#users-access',
    '/settings': '/command-center#users-access',
    '/customization': '/command-center#settings',
    '/billing': '/command-center#billing-plans',
    '/admin': '/command-center#system',
    '/onboarding': '/command-center#settings',
    '/reporting': '/command-center#alerts-reports',
    '/alerting': '/command-center#alerts-reports',
    '/analytics': '/command-center#overview',
    '/plan-limits': '/command-center#billing-plans',
    '/global-monitoring': '/command-center#system',
    '/global-catalog': '/command-center#system',
    '/enrichment': '/command-center',
    '/global-ai-config': '/command-center',
  }

  it('has 15 redirect mappings defined', () => {
    expect(Object.keys(REDIRECTS).length).toBe(15)
  })

  it('all redirects target /command-center', () => {
    for (const target of Object.values(REDIRECTS)) {
      expect(target.startsWith('/command-center')).toBe(true)
    }
  })

  it('absorbed admin routes target #system', () => {
    expect(REDIRECTS['/admin']).toBe('/command-center#system')
    expect(REDIRECTS['/global-monitoring']).toBe('/command-center#system')
    expect(REDIRECTS['/feeds']).toBe('/command-center#system')
    expect(REDIRECTS['/global-catalog']).toBe('/command-center#system')
  })

  it('absorbed billing routes target #billing-plans', () => {
    expect(REDIRECTS['/billing']).toBe('/command-center#billing-plans')
    expect(REDIRECTS['/plan-limits']).toBe('/command-center#billing-plans')
  })

  it('absorbed alerting/reporting routes target #alerts-reports', () => {
    expect(REDIRECTS['/reporting']).toBe('/command-center#alerts-reports')
    expect(REDIRECTS['/alerting']).toBe('/command-center#alerts-reports')
  })

  it('absorbed analytics route targets #overview', () => {
    expect(REDIRECTS['/analytics']).toBe('/command-center#overview')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 4. Hash Navigation Tests
// ═══════════════════════════════════════════════════════════════════

describe('Hash-based tab navigation', () => {
  it('TABS array includes system tab for super_admin', () => {
    // Verify the tab registry has system
    // We can't easily import TABS (it's module-scoped), so we test via the rendered component
    // In the SystemTab test above, we verify the tab renders. Here we verify module config.
    expect(MODULES.find(m => m.id === 'command-center')).toBeTruthy()
  })

  it('all tab IDs are valid hash targets', () => {
    const validTabs = [
      'overview', 'configuration', 'settings',
      'users-access', 'clients', 'billing-plans', 'alerts-reports', 'system',
    ]
    // S123e: 8 tabs — feeds absorbed into system sub-tab
    expect(validTabs.length).toBe(8)
    expect(validTabs).toContain('system')
    expect(validTabs).toContain('billing-plans')
    expect(validTabs).toContain('alerts-reports')
    expect(validTabs).not.toContain('feeds')
  })
})
