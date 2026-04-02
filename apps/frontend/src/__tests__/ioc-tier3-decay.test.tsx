/**
 * @module __tests__/ioc-tier3-decay.test
 * @description Tests for F1: Confidence Decay Timeline — math utils + chart rendering.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { computeDecayCurve, halfLifeDays, halfLifeLabel, getDecayRate, buildEventMarkers } from '@/utils/confidence-decay'
import { ConfidenceDecayChart } from '@/components/ioc/ConfidenceDecayChart'

// ─── Mock framer-motion ─────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    path: (props: any) => <path {...props} />,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}))

// ─── Unit: decay math ───────────────────────────────────────────
describe('confidence-decay utils', () => {
  it('returns correct decay rates per type', () => {
    expect(getDecayRate('ip')).toBe(0.05)
    expect(getDecayRate('domain')).toBe(0.02)
    expect(getDecayRate('hash_sha256')).toBe(0.001)
    expect(getDecayRate('url')).toBe(0.04)
    expect(getDecayRate('cve')).toBe(0.005)
  })

  it('normalizes hash subtypes to same decay rate', () => {
    expect(getDecayRate('hash_sha256')).toBe(getDecayRate('hash_md5'))
    expect(getDecayRate('file_hash_sha256')).toBe(0.001)
  })

  it('computes half-life correctly for IP (14 days)', () => {
    const days = halfLifeDays('ip')
    expect(days).toBeGreaterThanOrEqual(13)
    expect(days).toBeLessThanOrEqual(14)
  })

  it('computes half-life correctly for hash (near-permanent)', () => {
    expect(halfLifeDays('hash_sha256')).toBeGreaterThan(600)
  })

  it('generates human-readable half-life label', () => {
    expect(halfLifeLabel('ip')).toMatch(/IP.*14.*day.*half-life/)
    expect(halfLifeLabel('hash_sha256')).toMatch(/HASH.*yr.*half-life/)
  })

  it('computes decay curve with correct initial value', () => {
    const curve = computeDecayCurve(90, 'ip', 30)
    expect(curve[0]!.confidence).toBe(90)
    expect(curve[0]!.day).toBe(0)
    expect(curve.length).toBe(31) // days 0-30
  })

  it('IP decays faster than hash', () => {
    const ipCurve = computeDecayCurve(80, 'ip', 30)
    const hashCurve = computeDecayCurve(80, 'hash_sha256', 30)
    const ipEnd = ipCurve[ipCurve.length - 1]!.confidence
    const hashEnd = hashCurve[hashCurve.length - 1]!.confidence
    expect(ipEnd).toBeLessThan(hashEnd)
  })

  it('confidence approaches 0 for IP after many days', () => {
    const curve = computeDecayCurve(100, 'ip', 180)
    const last = curve[curve.length - 1]!.confidence
    expect(last).toBeLessThan(1)
  })

  it('builds event markers from timeline events', () => {
    const events = [
      { timestamp: '2026-04-03T00:00:00Z', summary: 'VT enriched +12%', eventType: 'enrichment' },
      { timestamp: '2026-04-10T00:00:00Z', summary: 'Sighted by feed', eventType: 'sighting' },
    ]
    const curve = computeDecayCurve(80, 'ip', 30)
    const markers = buildEventMarkers(events, '2026-04-01T00:00:00Z', curve)
    expect(markers).toHaveLength(2)
    expect(markers[0]!.day).toBe(2)
    expect(markers[0]!.label).toBe('VT enriched +12%')
    expect(markers[1]!.day).toBe(9)
  })
})

// ─── Component: ConfidenceDecayChart ────────────────────────────
describe('ConfidenceDecayChart', () => {
  const defaultProps = {
    confidence: 85,
    iocType: 'ip',
    firstSeen: '2026-03-20T00:00:00Z',
    timelineEvents: [
      { timestamp: '2026-03-22T00:00:00Z', summary: 'VT enriched', eventType: 'enrichment', source: 'VirusTotal' },
      { timestamp: '2026-03-25T00:00:00Z', summary: 'Risk propagated', eventType: 'correlation', source: 'correlation-engine' },
    ],
  }

  it('renders the chart container', () => {
    render(<ConfidenceDecayChart {...defaultProps} />)
    expect(screen.getByTestId('confidence-decay-chart')).toBeInTheDocument()
  })

  it('shows half-life label for the IOC type', () => {
    render(<ConfidenceDecayChart {...defaultProps} />)
    expect(screen.getByTestId('half-life-label')).toHaveTextContent(/IP.*14.*day/i)
  })

  it('renders the decay curve path', () => {
    render(<ConfidenceDecayChart {...defaultProps} />)
    expect(screen.getByTestId('decay-curve')).toBeInTheDocument()
  })

  it('renders event markers for timeline events', () => {
    render(<ConfidenceDecayChart {...defaultProps} />)
    const markers = screen.getAllByTestId('event-marker')
    expect(markers.length).toBe(2)
  })

  it('renders no markers when no timeline events', () => {
    render(<ConfidenceDecayChart {...defaultProps} timelineEvents={[]} />)
    expect(screen.queryAllByTestId('event-marker')).toHaveLength(0)
  })
})
