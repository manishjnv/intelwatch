/**
 * @module __tests__/integrations-panel
 * @description Tests for the real Integrations sub-tab (S166 Step 15 P1): TaxiiFeedCard,
 * ConnectionList, AddConnectionWizard. Mocked hook return shapes mirror the real backend
 * response bodies from apps/integration-service/src/routes/integrations.ts (RCA #45).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { TaxiiFeedCard } from '@/components/command-center/integrations/TaxiiFeedCard'
import { ConnectionList } from '@/components/command-center/integrations/ConnectionList'
import { AddConnectionWizard } from '@/components/command-center/integrations/AddConnectionWizard'
import { ApiError } from '@/lib/api'
import {
  useIntegrations, useIntegrationsHealth, useCreateIntegration,
  useUpdateIntegration, useDeleteIntegration, useTestIntegration,
} from '@/hooks/use-integrations'

vi.mock('@/hooks/use-integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-integrations')>()
  return {
    ...actual,
    useIntegrations: vi.fn(),
    useIntegrationsHealth: vi.fn(),
    useCreateIntegration: vi.fn(),
    useUpdateIntegration: vi.fn(),
    useDeleteIntegration: vi.fn(),
    useTestIntegration: vi.fn(),
  }
})

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// Real backend shape: integrations.ts GET /:list -> {data, total, page, limit}, secrets masked.
const REAL_INTEGRATION = {
  id: 'int1', tenantId: 't1', name: 'Prod Splunk', type: 'splunk_hec' as const, enabled: true,
  triggers: ['alert.created', 'ioc.created'] as const, fieldMappings: [], credentials: {},
  siemConfig: { type: 'splunk_hec' as const, url: 'https://splunk.example.com:8088', token: '********' },
  lastUsedAt: new Date(Date.now() - 3600_000).toISOString(),
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
}

describe('TaxiiFeedCard', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('shows the real discovery URL and copies it', async () => {
    render(<TaxiiFeedCard />)
    expect(screen.getByTestId('taxii-discovery-url').textContent).toContain('/api/v1/public/taxii/discovery')
    fireEvent.click(screen.getByTestId('taxii-copy-btn'))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/api/v1/public/taxii/discovery')))
  })

  it('states the auth method and never invents an API-key link', () => {
    render(<TaxiiFeedCard />)
    expect(screen.getByText(/X-API-Key/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('ConnectionList', () => {
  const onAdd = vi.fn()
  const onEdit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useIntegrationsHealth).mockReturnValue({ data: null, isLoading: false } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteIntegration).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
    vi.mocked(useTestIntegration).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  })

  it('renders real connection rows', () => {
    vi.mocked(useIntegrations).mockReturnValue({
      data: { data: [REAL_INTEGRATION], total: 1, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ConnectionList tenantPlan="teams" onAdd={onAdd} onEdit={onEdit} />)
    expect(screen.getByTestId('connection-int1')).toBeInTheDocument()
    expect(screen.getByText('Prod Splunk')).toBeInTheDocument()
    expect(screen.getByText('Splunk HEC')).toBeInTheDocument()
  })

  it('shows the empty state with an Add connection CTA', () => {
    vi.mocked(useIntegrations).mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ConnectionList tenantPlan="teams" onAdd={onAdd} onEdit={onEdit} />)
    expect(screen.getByTestId('connections-empty')).toBeInTheDocument()
  })

  it('shows the error state via QueryStateView, never fake data', () => {
    vi.mocked(useIntegrations).mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new ApiError(500, 'INTERNAL_ERROR', 'boom'), refetch: vi.fn(),
    } as never)
    render(<ConnectionList tenantPlan="teams" onAdd={onAdd} onEdit={onEdit} />)
    expect(screen.getByTestId('query-error')).toBeInTheDocument()
  })

  it('enable toggle calls the update (PUT) mutation', () => {
    const mutate = vi.fn()
    vi.mocked(useIntegrations).mockReturnValue({
      data: { data: [REAL_INTEGRATION], total: 1, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutate, isPending: false } as never)
    render(<ConnectionList tenantPlan="teams" onAdd={onAdd} onEdit={onEdit} />)
    fireEvent.click(screen.getByTestId('toggle-int1'))
    expect(mutate).toHaveBeenCalledWith({ id: 'int1', input: { enabled: false } }, expect.anything())
  })

  it('delete uses a ConfirmDialog, not window.confirm', () => {
    const mutate = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.mocked(useIntegrations).mockReturnValue({
      data: { data: [REAL_INTEGRATION], total: 1, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    vi.mocked(useDeleteIntegration).mockReturnValue({ mutate, isPending: false } as never)
    render(<ConnectionList tenantPlan="teams" onAdd={onAdd} onEdit={onEdit} />)
    fireEvent.click(screen.getByTestId('delete-int1'))
    expect(screen.getByTestId('delete-confirm-dialog')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('delete-confirm-btn'))
    expect(mutate).toHaveBeenCalledWith('int1', expect.anything())
  })

  it('shows the plan limit banner and disables Add at the limit', () => {
    vi.mocked(useIntegrations).mockReturnValue({
      data: { data: [REAL_INTEGRATION], total: 1, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ConnectionList tenantPlan="starter" onAdd={onAdd} onEdit={onEdit} />)
    expect(screen.getByTestId('plan-limit-banner')).toBeInTheDocument()
    expect(screen.getByTestId('add-connection-btn')).toBeDisabled()
  })

  it('never renders the old fake QRadar/XSOAR "connected" copy', () => {
    vi.mocked(useIntegrations).mockReturnValue({
      data: { data: [REAL_INTEGRATION], total: 1, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ConnectionList tenantPlan="teams" onAdd={onAdd} onEdit={onEdit} />)
    expect(screen.queryByText(/XSOAR/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/QRadar/i)).not.toBeInTheDocument()
  })
})

describe('AddConnectionWizard', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDeleteIntegration).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  })

  it('walks Splunk -> fields -> Save disabled until Test succeeds', async () => {
    const created = { ...REAL_INTEGRATION, id: 'new1' }
    const createMutateAsync = vi.fn().mockResolvedValue(created)
    const testMutateAsync = vi.fn().mockResolvedValue({ success: true, message: 'Connected OK' })
    vi.mocked(useCreateIntegration).mockReturnValue({ mutateAsync: createMutateAsync, isPending: false } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useTestIntegration).mockReturnValue({ mutateAsync: testMutateAsync, isPending: false } as never)

    render(<AddConnectionWizard onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pick-type-splunk_hec'))

    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Prod Splunk' } })
    fireEvent.change(screen.getByTestId('field-url'), { target: { value: 'https://splunk.example.com:8088' } })
    fireEvent.change(screen.getByTestId('field-token'), { target: { value: 'tok123' } })
    expect(screen.getByTestId('wizard-continue-btn')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('wizard-continue-btn'))

    expect(screen.getByTestId('wizard-save-btn')).toBeDisabled()
    fireEvent.click(screen.getByTestId('wizard-test-btn'))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    await waitFor(() => expect(testMutateAsync).toHaveBeenCalledWith('new1'))
    await waitFor(() => expect(screen.getByTestId('wizard-save-btn')).not.toBeDisabled())
    expect(screen.getByTestId('wizard-test-result')).toHaveTextContent('Connected OK')
  })

  it('shows the server test error inline, verbatim', async () => {
    const created = { ...REAL_INTEGRATION, id: 'new2', type: 'webhook' as const }
    vi.mocked(useCreateIntegration).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(created), isPending: false } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useTestIntegration).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: false, message: 'Connection refused at example.com:443' }),
      isPending: false,
    } as never)

    render(<AddConnectionWizard onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pick-type-webhook'))
    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'My webhook' } })
    fireEvent.change(screen.getByTestId('field-url'), { target: { value: 'https://example.com/hook' } })
    fireEvent.click(screen.getByTestId('wizard-continue-btn'))
    fireEvent.click(screen.getByTestId('wizard-test-btn'))

    await waitFor(() =>
      expect(screen.getByTestId('wizard-test-result')).toHaveTextContent('Connection refused at example.com:443'))
    expect(screen.getByTestId('wizard-save-btn')).toBeDisabled()
  })

  it('Escape after a failed test deletes the untested draft (no phantom row)', async () => {
    const deleteMutate = vi.fn()
    vi.mocked(useDeleteIntegration).mockReturnValue({ mutate: deleteMutate, isPending: false } as never)
    vi.mocked(useCreateIntegration).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ ...REAL_INTEGRATION, id: 'draft9', type: 'webhook' as const }), isPending: false,
    } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useTestIntegration).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: false, message: 'Timed out' }), isPending: false,
    } as never)

    render(<AddConnectionWizard onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pick-type-webhook'))
    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Draft hook' } })
    fireEvent.change(screen.getByTestId('field-url'), { target: { value: 'https://example.com/hook' } })
    fireEvent.click(screen.getByTestId('wizard-continue-btn'))
    fireEvent.click(screen.getByTestId('wizard-test-btn'))
    await waitFor(() => expect(screen.getByTestId('wizard-test-result')).toHaveTextContent('Timed out'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(deleteMutate).toHaveBeenCalledWith('draft9')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the 400 private-destination error inline on the URL field', async () => {
    const validationError = new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { path: 'siemConfig.url', message: 'Destination must be a publicly reachable address' },
    ])
    vi.mocked(useCreateIntegration).mockReturnValue({ mutateAsync: vi.fn().mockRejectedValue(validationError), isPending: false } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useTestIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    render(<AddConnectionWizard onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pick-type-splunk_hec'))
    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'Local test' } })
    fireEvent.change(screen.getByTestId('field-url'), { target: { value: 'http://localhost:8088' } })
    fireEvent.change(screen.getByTestId('field-token'), { target: { value: 'tok' } })
    fireEvent.click(screen.getByTestId('wizard-continue-btn'))
    fireEvent.click(screen.getByTestId('wizard-test-btn'))

    await waitFor(() =>
      expect(screen.getByTestId('wizard-field-error')).toHaveTextContent('Destination must be a publicly reachable address'))
    expect(screen.getByTestId('field-url')).toBeInTheDocument() // back on step 2, error sits on the field
  })

  it('never renders the old fake QRadar/XSOAR text', () => {
    vi.mocked(useCreateIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useUpdateIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useTestIntegration).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(<AddConnectionWizard onClose={onClose} />)
    expect(screen.queryByText(/XSOAR/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/QRadar/i)).not.toBeInTheDocument()
  })
})
