/**
 * @module __tests__/ioc-tier2-create-modal.test
 * @description Tests for the Create IOC manual submission modal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'

const mockInvalidateQueries = vi.fn()
const mockToast = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return { ...actual, useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }) }
})

vi.mock('@/components/ui/Toast', () => ({ toast: (...args: unknown[]) => mockToast(...args), ToastContainer: () => null }))

import { CreateIocModal } from '@/components/ioc/CreateIocModal'

beforeEach(() => { mockToast.mockClear(); mockInvalidateQueries.mockClear() })

describe('CreateIocModal', () => {
  it('renders when isOpen is true', () => {
    render(<CreateIocModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('create-ioc-modal')).toBeInTheDocument()
    expect(screen.getByTestId('ioc-value-input')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<CreateIocModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('create-ioc-modal')).not.toBeInTheDocument()
  })

  it('auto-detects IP type', async () => {
    render(<CreateIocModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByTestId('ioc-value-input')
    fireEvent.change(input, { target: { value: '185.220.101.34' } })
    await waitFor(() => {
      expect(screen.getByTestId('detected-type')).toHaveTextContent('ip')
    })
  })

  it('auto-detects domain type', async () => {
    render(<CreateIocModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByTestId('ioc-value-input')
    fireEvent.change(input, { target: { value: 'evil-payload.xyz' } })
    await waitFor(() => {
      expect(screen.getByTestId('detected-type')).toHaveTextContent('domain')
    })
  })

  it('auto-detects CVE type', async () => {
    render(<CreateIocModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByTestId('ioc-value-input')
    fireEvent.change(input, { target: { value: 'CVE-2024-12345' } })
    await waitFor(() => {
      expect(screen.getByTestId('detected-type')).toHaveTextContent('cve')
    })
  })

  it('shows validation error for empty value on submit', async () => {
    render(<CreateIocModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('create-ioc-submit'))
    await waitFor(() => {
      expect(screen.getByText('IOC value is required')).toBeInTheDocument()
    })
  })

  it('calls toast and invalidates cache on successful submit', async () => {
    const onClose = vi.fn()
    render(<CreateIocModal isOpen={true} onClose={onClose} />)

    // Fill form
    fireEvent.change(screen.getByTestId('ioc-value-input'), { target: { value: '10.0.0.1' } })

    // Wait for auto-detect to set iocType
    await waitFor(() => {
      expect(screen.getByTestId('detected-type')).toHaveTextContent('ip')
    })

    fireEvent.click(screen.getByTestId('create-ioc-submit'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('IOC queued for submission (backend pending)', 'success')
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['iocs'] })
      expect(onClose).toHaveBeenCalled()
    })
  })
})
