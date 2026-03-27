import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { StalenessIndicator } from '@/components/StalenessIndicator'

describe('StalenessIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows green dot + "Updated just now" for < 1 min age', () => {
    render(<StalenessIndicator lastUpdated={Date.now() - 30_000} />)
    const indicator = screen.getByTestId('staleness-indicator')
    expect(indicator).toHaveTextContent('Updated just now')
    // green dot = bg-sev-low class
    const dot = indicator.querySelector('.bg-sev-low')
    expect(dot).toBeInTheDocument()
  })

  it('shows green dot + "Updated 2m ago" for 2-minute-old data', () => {
    render(<StalenessIndicator lastUpdated={Date.now() - 2 * 60_000} />)
    expect(screen.getByTestId('staleness-indicator')).toHaveTextContent('Updated 2m ago')
  })

  it('shows amber dot + pulse animation for 8-minute-old data', () => {
    render(<StalenessIndicator lastUpdated={Date.now() - 8 * 60_000} />)
    const indicator = screen.getByTestId('staleness-indicator')
    expect(indicator).toHaveTextContent('Updated 8m ago')
    const dot = indicator.querySelector('.bg-sev-medium')
    expect(dot).toBeInTheDocument()
    expect(dot?.className).toContain('animate-pulse')
  })

  it('shows red dot + "click to refresh" for 20-minute-old data', () => {
    const onRefresh = vi.fn()
    render(<StalenessIndicator lastUpdated={Date.now() - 20 * 60_000} onRefresh={onRefresh} />)
    const cta = screen.getByTestId('staleness-refresh-cta')
    expect(cta).toBeInTheDocument()
    fireEvent.click(cta)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('clicking red indicator triggers refresh callback', () => {
    const onRefresh = vi.fn()
    render(<StalenessIndicator lastUpdated={Date.now() - 20 * 60_000} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByTestId('staleness-refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('compact variant shows dot + time only', () => {
    render(<StalenessIndicator lastUpdated={Date.now() - 3 * 60_000} compact />)
    const compact = screen.getByTestId('staleness-compact')
    expect(compact).toBeInTheDocument()
    expect(compact).toHaveTextContent('3m')
    // Should NOT have the full text
    expect(compact).not.toHaveTextContent('Updated')
  })

  it('compact hover shows tooltip with full timestamp', () => {
    render(<StalenessIndicator lastUpdated={new Date('2025-03-28T11:57:00Z')} compact />)
    const compact = screen.getByTestId('staleness-compact')
    expect(compact.getAttribute('title')).toBeTruthy()
  })

  it('unknown lastUpdated shows gray dot', () => {
    render(<StalenessIndicator lastUpdated={null} />)
    const indicator = screen.getByTestId('staleness-indicator')
    expect(indicator).toHaveTextContent('Last update unknown')
    const dot = indicator.querySelector('.bg-text-muted')
    expect(dot).toBeInTheDocument()
  })
})
