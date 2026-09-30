/**
 * @module __tests__/offboarding-panel.test
 * @description Tests for OffboardingPanel — deactivated-tenant list, offboard trigger,
 * reactivate action, status detail timeline, and honest empty/error states.
 * Owner decision 2026-09-30: offboarding = deactivate + retain data forever, no purge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { OffboardingPanel } from '@/components/command-center/OffboardingPanel'

// ─── Mock hooks ──────────────────────────────────────────────

const mockOffboardMutate = vi.fn()
const mockCancelMutate = vi.fn()
const mockRefetch = vi.fn()

const PIPELINE_DATA = [
  {
    tenantId: 't1', orgName: 'Sunset Corp', status: 'offboarding',
    offboardedBy: 'admin@system.local', offboardedAt: '2026-03-28T14:00:00Z',
  },
  {
    tenantId: 't2', orgName: 'Legacy Inc', status: 'offboarding',
    offboardedBy: 'admin@system.local', offboardedAt: '2026-03-10T09:00:00Z',
  },
]

vi.mock('@/hooks/use-offboarding', () => ({
  useOffboardingPipeline: () => ({
    data: PIPELINE_DATA, isLoading: false, isError: false, error: null, refetch: mockRefetch,
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
      ],
    },
    isLoading: false, isError: false, error: null, refetch: mockRefetch,
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

  it('renders deactivated organizations with "Deactivated · data retained" status', () => {
    render(<OffboardingPanel />)
    expect(screen.getByTestId('offboard-pipeline-list')).toBeInTheDocument()
    expect(screen.getByText('Sunset Corp')).toBeInTheDocument()
    expect(screen.getByText('Legacy Inc')).toBeInTheDocument()
    expect(screen.getAllByText('Deactivated · data retained')).toHaveLength(2)
  })

  it('never shows purge wording', () => {
    render(<OffboardingPanel />)
    expect(screen.queryByText(/purge/i)).not.toBeInTheDocument()
  })

  it('shows a Reactivate button for every entry', () => {
    render(<OffboardingPanel />)
    expect(screen.getByTestId('cancel-offboard-t1')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-offboard-t1')).toHaveTextContent('Reactivate')
    expect(screen.getByTestId('cancel-offboard-t2')).toBeInTheDocument()
  })

  it('shows offboard trigger button when triggerForTenant is provided', () => {
    render(<OffboardingPanel triggerForTenant={{ tenantId: 'tx', orgName: 'Test Org' }} />)
    expect(screen.getByTestId('offboard-trigger-btn')).toBeInTheDocument()
  })

  it('opens offboard confirm modal, requires name match, and confirm copy says data is kept', () => {
    render(<OffboardingPanel triggerForTenant={{ tenantId: 'tx', orgName: 'Test Org' }} />)
    fireEvent.click(screen.getByTestId('offboard-trigger-btn'))
    const modal = screen.getByTestId('offboard-confirm-modal')
    expect(modal).toBeInTheDocument()
    expect(modal.textContent).toMatch(/all its users/i)
    expect(modal.textContent).toMatch(/data is kept/i)
    expect(modal.textContent).not.toMatch(/purge/i)

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

    // Click the X close button in the modal header
    fireEvent.click(modal.querySelectorAll('button')[0]!)
    expect(screen.queryByTestId('offboard-confirm-modal')).not.toBeInTheDocument()
    expect(mockOffboardMutate).not.toHaveBeenCalled()
  })

  it('opens reactivate modal and calls mutation, with no purge wording', () => {
    render(<OffboardingPanel />)
    fireEvent.click(screen.getByTestId('cancel-offboard-t1'))
    const modal = screen.getByTestId('cancel-offboard-modal')
    expect(modal).toBeInTheDocument()
    expect(modal.textContent).toMatch(/Reactivate/)
    expect(modal.textContent).not.toMatch(/purge/i)
    fireEvent.click(screen.getByTestId('cancel-offboard-confirm-btn'))
    expect(mockCancelMutate).toHaveBeenCalled()
  })

  it('opens status detail panel when clicking view detail', () => {
    render(<OffboardingPanel />)
    fireEvent.click(screen.getByTestId('view-detail-t1'))
    expect(screen.getByTestId('offboard-status-panel')).toBeInTheDocument()
    expect(screen.getByTestId('offboard-timeline')).toBeInTheDocument()
  })

  it('status detail timeline shows completed and pending steps, no purge wording', () => {
    render(<OffboardingPanel />)
    fireEvent.click(screen.getByTestId('view-detail-t1'))
    const timeline = screen.getByTestId('offboard-timeline')
    expect(timeline.textContent).toContain('Users disabled')
    expect(timeline.textContent).toContain('(12)')
    expect(timeline.textContent).not.toMatch(/purge/i)
    expect(timeline.textContent).not.toMatch(/archive/i)
  })
})

describe('OffboardingPanel — empty state', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders honest empty state when no deactivated tenants', async () => {
    vi.doMock('@/hooks/use-offboarding', () => ({
      useOffboardingPipeline: () => ({
        data: [], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      }),
      useOffboardTenant: () => ({ mutate: vi.fn(), isPending: false }),
      useCancelOffboard: () => ({ mutate: vi.fn(), isPending: false }),
      useOffboardStatus: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
    }))

    const { OffboardingPanel: FreshPanel } = await import('@/components/command-center/OffboardingPanel')
    render(<FreshPanel />)
    expect(screen.getByTestId('offboard-empty')).toBeInTheDocument()
    expect(screen.getByText(/No organizations are deactivated/)).toBeInTheDocument()
  })

  it('renders honest error state with retry when the pipeline fetch fails', async () => {
    vi.doMock('@/hooks/use-offboarding', () => ({
      useOffboardingPipeline: () => ({
        data: undefined, isLoading: false, isError: true, error: new Error('network down'), refetch: vi.fn(),
      }),
      useOffboardTenant: () => ({ mutate: vi.fn(), isPending: false }),
      useCancelOffboard: () => ({ mutate: vi.fn(), isPending: false }),
      useOffboardStatus: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
    }))

    const { OffboardingPanel: FreshPanel } = await import('@/components/command-center/OffboardingPanel')
    render(<FreshPanel />)
    expect(screen.getByTestId('query-error')).toBeInTheDocument()
    expect(screen.queryByTestId('offboard-empty')).not.toBeInTheDocument()
  })
})
