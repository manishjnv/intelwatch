/**
 * @module __tests__/ioc-tier2-saved-presets.test
 * @description Tests for saved filter presets dropdown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockToast = vi.fn()

vi.mock('@/components/ui/Toast', () => ({ toast: (...args: unknown[]) => mockToast(...args), ToastContainer: () => null }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: (s: { user: { tenantId: string } }) => unknown) => sel({ user: { tenantId: 'test-tenant' } }),
}))

import { SavedFilterPresets } from '@/components/ioc/SavedFilterPresets'

beforeEach(() => {
  mockToast.mockClear()
  localStorage.clear()
})

const defaultProps = {
  currentFilters: {},
  currentSortBy: 'lastSeen',
  currentSortOrder: 'desc' as const,
  currentSearch: '',
  onLoadPreset: vi.fn(),
}

describe('SavedFilterPresets', () => {
  it('renders the Saved Views button', () => {
    render(<SavedFilterPresets {...defaultProps} />)
    expect(screen.getByTestId('saved-views-btn')).toBeInTheDocument()
  })

  it('shows dropdown with default presets on click', () => {
    render(<SavedFilterPresets {...defaultProps} />)
    fireEvent.click(screen.getByTestId('saved-views-btn'))
    expect(screen.getByTestId('saved-views-dropdown')).toBeInTheDocument()
    expect(screen.getByTestId('preset-default-critical-7d')).toBeInTheDocument()
    expect(screen.getByTestId('preset-default-unverified-ips')).toBeInTheDocument()
    expect(screen.getByTestId('preset-default-high-conf-expired')).toBeInTheDocument()
    expect(screen.getByTestId('preset-default-all-domains')).toBeInTheDocument()
  })

  it('calls onLoadPreset when a preset is clicked', () => {
    const onLoad = vi.fn()
    render(<SavedFilterPresets {...defaultProps} onLoadPreset={onLoad} />)
    fireEvent.click(screen.getByTestId('saved-views-btn'))
    fireEvent.click(screen.getByTestId('preset-default-critical-7d'))
    expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default-critical-7d', name: 'Critical Last 7d', filters: { severity: 'critical' } }),
    )
  })

  it('saves a custom preset', () => {
    render(<SavedFilterPresets {...defaultProps} />)
    fireEvent.click(screen.getByTestId('saved-views-btn'))
    fireEvent.click(screen.getByTestId('save-current-view-btn'))
    const input = screen.getByTestId('save-preset-input')
    fireEvent.change(input, { target: { value: 'My Custom View' } })
    fireEvent.click(screen.getByTestId('save-preset-confirm'))
    expect(mockToast).toHaveBeenCalledWith('Saved view "My Custom View"', 'success')
  })

  it('persists custom preset to localStorage', () => {
    render(<SavedFilterPresets {...defaultProps} currentFilters={{ severity: 'high' }} />)
    fireEvent.click(screen.getByTestId('saved-views-btn'))
    fireEvent.click(screen.getByTestId('save-current-view-btn'))
    fireEvent.change(screen.getByTestId('save-preset-input'), { target: { value: 'Test Preset' } })
    fireEvent.click(screen.getByTestId('save-preset-confirm'))

    const stored = JSON.parse(localStorage.getItem('etip-ioc-presets-test-tenant') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Test Preset')
    expect(stored[0].filters).toEqual({ severity: 'high' })
  })

  it('does not show delete button for default presets', () => {
    render(<SavedFilterPresets {...defaultProps} />)
    fireEvent.click(screen.getByTestId('saved-views-btn'))
    expect(screen.queryByTestId('delete-preset-default-critical-7d')).not.toBeInTheDocument()
  })
})
