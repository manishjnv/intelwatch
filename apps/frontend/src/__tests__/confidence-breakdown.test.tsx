/**
 * @module tests/confidence-breakdown
 * @description Tests for ConfidenceBreakdown component:
 *   - Renders breakdown when confidence > 0
 *   - Shows time decay label when lastSeen > 0 days ago
 *   - Collapses/expands on toggle
 *   - Demo fallback renders correctly
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ConfidenceBreakdown } from '@/components/viz/ConfidenceBreakdown'
import type { IOCRecord } from '@/hooks/use-intel-data'

function makeRecord(overrides: Partial<IOCRecord> = {}): IOCRecord {
  return {
    id: 'ioc-1', iocType: 'ip', normalizedValue: '1.2.3.4', severity: 'high',
    confidence: 82, lifecycle: 'active', tlp: 'amber', tags: ['c2'],
    threatActors: ['APT28'], malwareFamilies: ['Cobalt Strike'],
    firstSeen: new Date(Date.now() - 28 * 86_400_000).toISOString(),
    lastSeen: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    ...overrides,
  }
}

describe('ConfidenceBreakdown', () => {
  it('renders breakdown toggle when confidence > 0 and isDemo', () => {
    render(<ConfidenceBreakdown record={makeRecord()} isDemo={true} />)
    expect(screen.getByTestId('confidence-breakdown')).toBeTruthy()
    expect(screen.getByTestId('confidence-breakdown-toggle')).toBeTruthy()
    expect(screen.getByText('Confidence Score')).toBeTruthy()
  })

  it('does not render when confidence is 0', () => {
    render(<ConfidenceBreakdown record={makeRecord({ confidence: 0 })} isDemo={true} />)
    expect(screen.queryByTestId('confidence-breakdown')).toBeNull()
  })

  it('expands and shows breakdown rows on toggle click', () => {
    render(<ConfidenceBreakdown record={makeRecord()} isDemo={true} />)
    // Initially collapsed — body not visible
    expect(screen.queryByTestId('confidence-breakdown-body')).toBeNull()

    // Click to expand
    fireEvent.click(screen.getByTestId('confidence-breakdown-toggle'))
    expect(screen.getByTestId('confidence-breakdown-body')).toBeTruthy()

    // Shows formula components
    expect(screen.getByText('Feed Reliability')).toBeTruthy()
    expect(screen.getByText(/Corroboration/)).toBeTruthy()
    expect(screen.getByText('AI Enrichment')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()
  })

  it('collapses on second toggle click', () => {
    render(<ConfidenceBreakdown record={makeRecord()} isDemo={true} />)
    const toggle = screen.getByTestId('confidence-breakdown-toggle')

    fireEvent.click(toggle) // expand
    expect(screen.getByTestId('confidence-breakdown-body')).toBeTruthy()

    fireEvent.click(toggle) // collapse
    expect(screen.queryByTestId('confidence-breakdown-body')).toBeNull()
  })

  it('shows time decay label when lastSeen > 0 days ago', () => {
    render(<ConfidenceBreakdown record={makeRecord()} isDemo={true} />)
    fireEvent.click(screen.getByTestId('confidence-breakdown-toggle'))
    expect(screen.getByText(/Time Decay/)).toBeTruthy()
    expect(screen.getByText(/14d old/)).toBeTruthy()
  })

  it('does not show time decay when lastSeen is today', () => {
    const record = makeRecord({ lastSeen: new Date().toISOString() })
    render(<ConfidenceBreakdown record={record} isDemo={true} />)
    fireEvent.click(screen.getByTestId('confidence-breakdown-toggle'))
    expect(screen.queryByText(/Time Decay/)).toBeNull()
  })

  it('renders with real backend fields when available', () => {
    const record = makeRecord({
      feedReliability: 75,
      corroborationCount: 3,
      aiConfidence: 68,
    })
    render(<ConfidenceBreakdown record={record} isDemo={false} />)
    fireEvent.click(screen.getByTestId('confidence-breakdown-toggle'))

    // Feed: 0.75 × 35% = 26%
    expect(screen.getByText(/0\.75/)).toBeTruthy()
    // AI: 0.68 × 30% = 20%
    expect(screen.getByText(/0\.68/)).toBeTruthy()
    // Corroboration: 3 sources → min(3*33, 100) = 99 → 0.99 × 35% = 35%
    expect(screen.getByText(/3 sources/)).toBeTruthy()
  })

  it('demo fallback computes reasonable values from confidence', () => {
    const record = makeRecord({ confidence: 82 })
    render(<ConfidenceBreakdown record={record} isDemo={true} />)
    fireEvent.click(screen.getByTestId('confidence-breakdown-toggle'))

    // Should show some breakdown values (demo-computed)
    const body = screen.getByTestId('confidence-breakdown-body')
    expect(body.textContent).toContain('35%')
    expect(body.textContent).toContain('30%')
  })
})
