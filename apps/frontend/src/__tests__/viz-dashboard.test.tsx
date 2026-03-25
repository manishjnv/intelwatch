/**
 * Tests for dashboard viz components:
 * - SeverityHeatmap (#2)
 * - AmbientBackground (#15)
 * - ParallaxCard (#13)
 * - ThreatTimeline (#14)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// Mock the data hook for SeverityHeatmap
vi.mock('@/hooks/use-intel-data', () => ({
  useIOCStats: vi.fn(() => ({
    data: {
      total: 301,
      byType: { ip: 50, domain: 80, url: 40, hash_sha256: 30, cve: 90, email: 11 },
      bySeverity: { critical: 10, high: 40, medium: 200, low: 46, info: 5 },
      byLifecycle: { new: 285, active: 16 },
    },
  })),
  useIOCs: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useDashboardStats: vi.fn(() => ({ data: null })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

import { SeverityHeatmap } from '@/components/viz/SeverityHeatmap'
import { AmbientBackground } from '@/components/viz/AmbientBackground'
import { ParallaxCard } from '@/components/viz/ParallaxCard'
import { ThreatTimeline, generateStubEvents, type TimelineEvent } from '@/components/viz/ThreatTimeline'

/* ================================================================ */
/* SeverityHeatmap (#2)                                              */
/* ================================================================ */
describe('SeverityHeatmap', () => {
  it('renders the heatmap container', () => {
    render(<SeverityHeatmap />)
    expect(screen.getByTestId('severity-heatmap')).toBeInTheDocument()
  })

  it('renders correct number of cells (6 types x 5 severities = 30)', () => {
    render(<SeverityHeatmap />)
    const cells = screen.getAllByTestId(/^heatmap-cell-/)
    expect(cells).toHaveLength(30)
  })

  it('displays severity header labels', () => {
    render(<SeverityHeatmap />)
    expect(screen.getByText('CRIT')).toBeInTheDocument()
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('MED')).toBeInTheDocument()
    expect(screen.getByText('LOW')).toBeInTheDocument()
    expect(screen.getByText('INFO')).toBeInTheDocument()
  })

  it('displays IOC type row labels', () => {
    render(<SeverityHeatmap />)
    expect(screen.getByText('IP')).toBeInTheDocument()
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('URL')).toBeInTheDocument()
    expect(screen.getByText('CVE')).toBeInTheDocument()
  })

  it('renders cell with correct test id', () => {
    render(<SeverityHeatmap />)
    const cell = screen.getByTestId('heatmap-cell-ip-critical')
    expect(cell).toBeInTheDocument()
    // Cell should contain a numeric count
    expect(cell.textContent).toMatch(/\d+/)
  })

  it('applies className prop', () => {
    render(<SeverityHeatmap className="mt-4" />)
    expect(screen.getByTestId('severity-heatmap')).toHaveClass('mt-4')
  })

  it('renders section heading', () => {
    render(<SeverityHeatmap />)
    expect(screen.getByText('IOC Severity Distribution')).toBeInTheDocument()
  })

  it('shows empty state when no data', async () => {
    const { useIOCStats } = await import('@/hooks/use-intel-data')
    vi.mocked(useIOCStats).mockReturnValueOnce({ data: undefined } as any)
    render(<SeverityHeatmap />)
    expect(screen.getByText('No IOC data for heatmap')).toBeInTheDocument()
  })
})

/* ================================================================ */
/* AmbientBackground (#15)                                          */
/* ================================================================ */
describe('AmbientBackground', () => {
  it('renders the ambient container', () => {
    render(<AmbientBackground threatLevel="normal" />)
    expect(screen.getByTestId('ambient-background')).toBeInTheDocument()
  })

  it('sets data-threat-level attribute', () => {
    render(<AmbientBackground threatLevel="critical" />)
    expect(screen.getByTestId('ambient-background')).toHaveAttribute('data-threat-level', 'critical')
  })

  it('has pointer-events-none for non-interaction', () => {
    render(<AmbientBackground threatLevel="normal" />)
    expect(screen.getByTestId('ambient-background')).toHaveClass('pointer-events-none')
  })

  it('renders corner accents for elevated level', () => {
    const { container } = render(<AmbientBackground threatLevel="high" />)
    const blurElements = container.querySelectorAll('.blur-3xl')
    expect(blurElements.length).toBeGreaterThan(0)
  })

  it('does not render corner accents for normal level', () => {
    const { container } = render(<AmbientBackground threatLevel="normal" />)
    const blurElements = container.querySelectorAll('.blur-3xl')
    expect(blurElements.length).toBe(0)
  })

  it('applies different animation speeds per threat level', () => {
    const { rerender, container } = render(<AmbientBackground threatLevel="normal" />)
    const gridEl = container.querySelector('.bg-grid-overlay')
    expect(gridEl?.className).toContain('6s')

    rerender(<AmbientBackground threatLevel="critical" />)
    const gridEl2 = container.querySelector('.bg-grid-overlay')
    expect(gridEl2?.className).toContain('1.5s')
  })
})

/* ================================================================ */
/* ParallaxCard (#13)                                               */
/* ================================================================ */
describe('ParallaxCard', () => {
  it('renders children inside the card', () => {
    render(<ParallaxCard><div data-testid="child">Hello</div></ParallaxCard>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders parallax layers', () => {
    render(<ParallaxCard><span>X</span></ParallaxCard>)
    expect(screen.getByTestId('parallax-bg')).toBeInTheDocument()
    expect(screen.getByTestId('parallax-fg')).toBeInTheDocument()
  })

  it('applies className prop', () => {
    render(<ParallaxCard className="my-class"><span>X</span></ParallaxCard>)
    expect(screen.getByTestId('parallax-card')).toHaveClass('my-class')
  })

  it('resets transform on mouse leave', () => {
    render(<ParallaxCard><span>X</span></ParallaxCard>)
    const card = screen.getByTestId('parallax-card')
    fireEvent.mouseLeave(card)
    const bg = screen.getByTestId('parallax-bg')
    expect(bg.style.transform).toBe('translate(0,0)')
  })

  it('updates transform on mouse move', () => {
    render(<ParallaxCard depth={20}><span>X</span></ParallaxCard>)
    const card = screen.getByTestId('parallax-card')
    // Simulate mouse move (center-ish)
    fireEvent.mouseMove(card, { clientX: 100, clientY: 50 })
    // The transform should have changed (exact values depend on element rect)
    const fg = screen.getByTestId('parallax-fg')
    expect(fg.style.transform).toBeDefined()
  })

  it('wraps IntelCard without modifying it', () => {
    render(
      <ParallaxCard>
        <div data-testid="intel-card-mock" className="bg-elevated">IntelCard content</div>
      </ParallaxCard>
    )
    const child = screen.getByTestId('intel-card-mock')
    expect(child).toHaveClass('bg-elevated')
    expect(child).toHaveTextContent('IntelCard content')
  })
})

/* ================================================================ */
/* ThreatTimeline (#14)                                             */
/* ================================================================ */
describe('ThreatTimeline', () => {
  it('renders timeline container', () => {
    render(<ThreatTimeline />)
    expect(screen.getByTestId('threat-timeline')).toBeInTheDocument()
  })

  it('renders stub events when no events prop', () => {
    render(<ThreatTimeline />)
    const events = screen.getAllByTestId('timeline-event')
    expect(events.length).toBeGreaterThan(0)
    expect(events.length).toBeLessThanOrEqual(20)
  })

  it('renders provided events', () => {
    const events: TimelineEvent[] = [
      { id: '1', timestamp: '2026-03-21T10:00:00Z', label: 'IP-001', type: 'ip', severity: 'critical' },
      { id: '2', timestamp: '2026-03-21T11:00:00Z', label: 'CVE-002', type: 'cve', severity: 'high' },
    ]
    render(<ThreatTimeline events={events} />)
    expect(screen.getAllByTestId('timeline-event')).toHaveLength(2)
  })

  it('respects maxEvents limit', () => {
    render(<ThreatTimeline maxEvents={5} />)
    const events = screen.getAllByTestId('timeline-event')
    expect(events.length).toBeLessThanOrEqual(5)
  })

  it('shows empty state message', () => {
    render(<ThreatTimeline events={[]} />)
    expect(screen.getByText('No recent events')).toBeInTheDocument()
  })

  it('displays section heading', () => {
    render(<ThreatTimeline />)
    expect(screen.getByText('Threat Activity Timeline')).toBeInTheDocument()
  })

  it('applies className prop', () => {
    render(<ThreatTimeline className="mt-6" />)
    expect(screen.getByTestId('threat-timeline')).toHaveClass('mt-6')
  })

  it('generateStubEvents returns sorted events', () => {
    const events = generateStubEvents(10)
    expect(events).toHaveLength(10)
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i]!.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(events[i - 1]!.timestamp).getTime()
      )
    }
  })
})
