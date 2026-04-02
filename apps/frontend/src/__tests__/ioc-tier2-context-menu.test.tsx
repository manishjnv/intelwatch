/**
 * @module __tests__/ioc-tier2-context-menu.test
 * @description Tests for the IOC right-click context menu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockNavigate = vi.fn()
const mockToast = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/components/ui/Toast', () => ({ toast: (...args: unknown[]) => mockToast(...args), ToastContainer: () => null }))

import { IocContextMenu } from '@/components/ioc/IocContextMenu'

const MOCK_IOC = {
  id: 'ioc-1', iocType: 'ip', normalizedValue: '185.220.101.34', severity: 'critical',
  confidence: 92, lifecycle: 'active', tlp: 'red', tags: ['apt'],
  threatActors: [], malwareFamilies: [],
  firstSeen: '2026-04-01T10:00:00Z', lastSeen: '2026-04-02T08:00:00Z',
}

const POSITION = { x: 100, y: 200 }

beforeEach(() => { mockNavigate.mockClear(); mockToast.mockClear() })

describe('IocContextMenu', () => {
  it('renders when ioc and position are provided', () => {
    render(<IocContextMenu ioc={MOCK_IOC} position={POSITION} onClose={vi.fn()} />)
    expect(screen.getByTestId('ioc-context-menu')).toBeInTheDocument()
  })

  it('does not render when ioc is null', () => {
    render(<IocContextMenu ioc={null} position={null} onClose={vi.fn()} />)
    expect(screen.queryByTestId('ioc-context-menu')).not.toBeInTheDocument()
  })

  it('copies value to clipboard on "Copy Value"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true })
    const onClose = vi.fn()

    render(<IocContextMenu ioc={MOCK_IOC} position={POSITION} onClose={onClose} />)
    await fireEvent.click(screen.getByTestId('ctx-copy'))

    expect(writeText).toHaveBeenCalledWith('185.220.101.34')
  })

  it('copies defanged value on "Copy Defanged"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true })

    render(<IocContextMenu ioc={MOCK_IOC} position={POSITION} onClose={vi.fn()} />)
    await fireEvent.click(screen.getByTestId('ctx-defang'))

    expect(writeText).toHaveBeenCalledWith('185[.]220[.]101[.]34')
  })

  it('shows lifecycle transition options excluding current state', () => {
    render(<IocContextMenu ioc={MOCK_IOC} position={POSITION} onClose={vi.fn()} />)
    // Current lifecycle is 'active' — should see new, aging, expired but NOT active
    expect(screen.getByTestId('ctx-lifecycle-new')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-lifecycle-aging')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-lifecycle-expired')).toBeInTheDocument()
    expect(screen.queryByTestId('ctx-lifecycle-active')).not.toBeInTheDocument()
  })

  it('calls onLifecycleChange when lifecycle option clicked', () => {
    const onLifecycleChange = vi.fn()
    const onClose = vi.fn()
    render(<IocContextMenu ioc={MOCK_IOC} position={POSITION} onClose={onClose} onLifecycleChange={onLifecycleChange} />)
    fireEvent.click(screen.getByTestId('ctx-lifecycle-expired'))
    expect(onLifecycleChange).toHaveBeenCalledWith('ioc-1', 'expired')
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates to threat graph on "Show in Threat Graph"', () => {
    render(<IocContextMenu ioc={MOCK_IOC} position={POSITION} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('ctx-graph'))
    expect(mockNavigate).toHaveBeenCalledWith('/graph?ioc=185.220.101.34')
  })
})
