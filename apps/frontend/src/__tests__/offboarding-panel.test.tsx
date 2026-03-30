/**
 * @module __tests__/offboarding-panel.test
 * @description Tests for OffboardingPanel — pipeline view, offboard trigger,
 * cancel offboarding, status detail timeline, purge countdown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { OffboardingPanel } from '@/components/command-center/OffboardingPanel'

// ─── Mock hooks ──────────────────────────────────────────────

const mockOffboardMutate = vi.fn()
const mockCancelMutate = vi.fn()

vi.mock('@/hooks/use-offboarding', () => ({
  useOffboardingPipeline: () => ({
    data: [
      {
        tenantId: 't1', orgName: 'Sunset Corp', status: 'offboarding',
        offboardedBy: 'admin@system.local', offboardedAt: '2026-03-28T14:00:00Z',
        purgeScheduledAt: '2026-05-27T14:00:00Z', purgedAt: null,
      },
      {
        tenantId: 't2', orgName: 'Legacy Inc', status: 'archived',
        offboardedBy: 'admin@system.local', offboardedAt: '2026-03-10T09:00:00Z',
        purgeScheduledAt: '2026-05-09T09:00:00Z', purgedAt: null,
      },
      {
        tenantId: 't3', orgName: 'Old Systems Ltd', status: 'purged',
        offboardedBy: 'admin@system.local', offboardedAt: '2026-01-15T12:00:00Z',
        purgeScheduledAt: '2026-03-16T12:00:00Z', purgedAt: '2026-03-16T12:05:00Z',
      },
    ],
    isLoading: false, isDemo: false,
  }),
  useOffboardTenant: () => ({
    mutate: mockOffboardMutate,
    isPending: false,
  }),
  useCancelOffboard: () => ({
    mutate: mockCancelMutate,
    isPending: false,
  }),
  useOffboardStatus: () => ({
    data: {
      tenantId: 't1', orgName: 'Sunset Corp', status: 'offboarding',
      steps: [
        { label: 'Users disabled', completed: true, count: 12 },
        { label: 'Sessions terminated', completed: true, count: 8 },
        { label: 'API keys revoked', completed: true, count: 3 },
        { label: 'SSO disabled', completed: true },
        { label: 'Archive to S3', completed: false },
        { label: 'Data purge', completed: false },
      ],
      archivePath: null,
    },
    isLoading: false, isDemo: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'u0', role: 'super_admin', tenantId: 't0' } }),
}))

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// ─── Tests ──────────────────────────────────────────────────

describe('OffboardingPanel', () => {
  beforeEach(() => {
    mockOffboardMutate.mockClear()
    mockCancelMutate.mockClear()
  })

  it('renders pipeline list with correct status badges', () => {
    render(<OffboardingPanel />)
    expect(screen.getByTestId('offboard-pipeline-list')).toBeInTheDocument()
    expect(screen.getByText('Sunset Corp')).toBeInTheDocument()
    expect(screen.getByText('Legacy Inc')).toBeInTheDocument()
    expect(screen.getByText('Old Systems Ltd')).toBeInTheDocument()
    expect(screen.getByText('Offboarding In Progress')).toBeInTheDocument()
    expect(screen.getByText(/Archived/)).toBeInTheDocument()
    expect(screen.getByText('Purged')).toBeInTheDocument()
  })

  it('shows purge countdown for non-purged entries', () => {
    render(<OffboardingPanel />)
    // Both offboarding and archived entries show purge countdown
    const countdowns = screen.getAllByText(/Purges in \d+ day/)
    expect(countdowns.length).toBeGreaterThanOrEqual(1)
  })

  it('shows cancel button for offboarding and archived, hidden for purged', () => {
    render(<OffboardingPanel />)
    expect(screen.getByTestId('cancel-offboard-t1')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-offboard-t2')).toBeInTheDocument()
    expect(screen.queryByTestId('cancel-offboard-t3')).not.toBeInTheDocument()
  })

  it('shows offboard trigger button when triggerForTenant is provided', () => {
    render(<OffboardingPanel triggerForTenant={{ tenantId: 'tx', orgName: 'Test Org' }} />)
    expect(screen.getByTestId('offboard-trigger-btn')).toBeInTheDocument()
  })

  it('opens offboard confirm modal and requires name match', () => {
    render(<OffboardingPanel triggerForTenant={{ tenantId: 'tx', orgName: 'Test Org' }} />)
    fireEvent.click(screen.getByTestId('offboard-trigger-btn'))
    expect(screen.getByTestId('offboard-confirm-modal')).toBeInTheDocument()

    // Submit should be disabled
    const confirmBtn = screen.getByTestId('offboard-confirm-btn')
    expect(confirmBtn).toBeDisabled()

    // Type wrong name
    fireEvent.change(screen.getByTestId('offboard-confirm-input'), { target: { value: 'Wrong' } })
    expect(confirmBtn).toBeDisabled()

    // Type correct name
    fireEvent.change(screen.getByTestId('offboard-confirm-input'), { target: { value: 'Test Org' } })
    expect(confirmBtn).not.toBeDisabled()

    // Click confirm
    fireEvent.click(confirmBtn)
    expect(mockOffboardMutate).toHaveBeenCalled()
  })

  it('cancel button closes modal without action', () => {
    render(<OffboardingPanel triggerForTenant={{ tenantId: 'tx', orgName: 'Test Org' }} />)
    fireEvent.click(screen.getByTestId('offboard-trigger-btn'))
    const modal = screen.getByTestId('offboard-confirm-modal')
    expect(modal).toBeInTheDocument()

    // Click cancel button inside modal
    const cancelBtn = modal.querySelector('button:first-of-type')!
    // The X close button is the first button in the modal header
    fireEvent.click(modal.querySelectorAll('button')[0]) // X button
    expect(screen.queryByTestId('offboard-confirm-modal')).not.toBeInTheDocument()
    expect(mockOffboardMutate).not.toHaveBeenCalled()
  })

  it('opens cancel offboarding modal and calls mutation', () => {
    render(<OffboardingPanel />)
    fireEvent.click(screen.getByTestId('cancel-offboard-t1'))
    expect(screen.getByTestId('cancel-offboard-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cancel-offboard-confirm-btn'))
    expect(mockCancelMutate).toHaveBeenCalled()
  })

  it('opens status detail panel when clicking view detail', () => {
    render(<OffboardingPanel />)
    fireEvent.click(screen.getByTestId('view-detail-t1'))
    expect(screen.getByTestId('offboard-status-panel')).toBeInTheDocument()
    expect(screen.getByTestId('offboard-timeline')).toBeInTheDocument()
  })

  it('status detail timeline shows completed and pending steps', () => {
    render(<OffboardingPanel />)
    fireEvent.click(screen.getByTestId('view-detail-t1'))
    const timeline = screen.getByTestId('offboard-timeline')
    expect(timeline.textContent).toContain('Users disabled')
    expect(timeline.textContent).toContain('(12)')
    expect(timeline.textContent).toContain('Archive to S3')
  })
})

describe('OffboardingPanel — empty state', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders empty state when no pipeline entries', async () => {
    vi.doMock('@/hooks/use-offboarding', () => ({
      useOffboardingPipeline: () => ({
        data: [], isLoading: false, isDemo: false,
      }),
      useOffboardTenant: () => ({ mutate: vi.fn(), isPending: false }),
      useCancelOffboard: () => ({ mutate: vi.fn(), isPending: false }),
      useOffboardStatus: () => ({ data: null, isLoading: false, isDemo: false }),
    }))

    const { OffboardingPanel: FreshPanel } = await import('@/components/command-center/OffboardingPanel')
    render(<FreshPanel />)
    expect(screen.getByTestId('offboard-empty')).toBeInTheDocument()
    expect(screen.getByText(/No organizations in the offboarding pipeline/)).toBeInTheDocument()
  })
})
