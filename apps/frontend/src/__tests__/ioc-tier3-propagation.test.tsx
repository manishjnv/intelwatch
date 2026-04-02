/**
 * @module __tests__/ioc-tier3-propagation.test
 * @description Tests for F3: Risk Propagation Banner.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { RiskPropagationBanner } from '@/components/ioc/RiskPropagationBanner'

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}))

const correlationEvent = {
  timestamp: '2026-04-01T12:00:00Z',
  eventType: 'correlation' as const,
  summary: 'Risk propagated from 185.220.101.34 — confidence boosted by +15%',
  source: 'correlation-engine',
}

const enrichmentEvent = {
  timestamp: '2026-04-01T10:00:00Z',
  eventType: 'enrichment' as const,
  summary: 'VT enriched with 12/68 detections',
  source: 'VirusTotal',
}

describe('RiskPropagationBanner', () => {
  it('renders null when no correlation events', () => {
    render(<RiskPropagationBanner timelineEvents={[enrichmentEvent]} />)
    expect(screen.queryByTestId('risk-propagation-banner')).toBeNull()
  })

  it('renders null when events array is empty', () => {
    render(<RiskPropagationBanner timelineEvents={[]} />)
    expect(screen.queryByTestId('risk-propagation-banner')).toBeNull()
  })

  it('renders banner for correlation event', () => {
    render(<RiskPropagationBanner timelineEvents={[correlationEvent]} />)
    expect(screen.getByTestId('risk-propagation-banner')).toBeInTheDocument()
    expect(screen.getByTestId('propagation-summary')).toHaveTextContent('Risk propagated from 185.220.101.34')
  })

  it('shows source and date', () => {
    render(<RiskPropagationBanner timelineEvents={[correlationEvent]} />)
    expect(screen.getByText(/correlation-engine/)).toBeInTheDocument()
  })

  it('dismisses on X click', () => {
    render(<RiskPropagationBanner timelineEvents={[correlationEvent]} />)
    expect(screen.getByTestId('risk-propagation-banner')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dismiss-propagation'))
    expect(screen.queryByTestId('risk-propagation-banner')).toBeNull()
  })

  it('shows count when multiple correlation events', () => {
    const events = [
      correlationEvent,
      { ...correlationEvent, timestamp: '2026-04-02T12:00:00Z', summary: 'Second propagation' },
    ]
    render(<RiskPropagationBanner timelineEvents={events} />)
    expect(screen.getByText(/\+1 more propagation event/)).toBeInTheDocument()
  })

  it('ignores non-correlation events in event list', () => {
    render(<RiskPropagationBanner timelineEvents={[enrichmentEvent, correlationEvent]} />)
    // Should only show the correlation event summary
    expect(screen.getByTestId('propagation-summary')).toHaveTextContent('Risk propagated')
  })
})
