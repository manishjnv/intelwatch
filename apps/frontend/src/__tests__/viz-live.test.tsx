/**
 * Tests for live/interactive viz components:
 * - ThreatPulseStrip (#1)
 * - RelationshipGraph (#10)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

// Mock hooks
vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: vi.fn(() => ({
    data: {
      data: [
        { id: '1', normalizedValue: '1.2.3.4', iocType: 'ip', severity: 'critical', lastSeen: new Date().toISOString() },
        { id: '2', normalizedValue: 'evil.com', iocType: 'domain', severity: 'high', lastSeen: new Date().toISOString() },
        { id: '3', normalizedValue: 'CVE-2024-1234', iocType: 'cve', severity: 'medium', lastSeen: new Date().toISOString() },
      ],
      total: 3,
    },
  })),
  useIOCStats: vi.fn(() => ({ data: null })),
  useDashboardStats: vi.fn(() => ({ data: null })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

import { ThreatPulseStrip } from '@/components/viz/ThreatPulseStrip'
import { RelationshipGraph, generateStubRelations, type GraphNode, type GraphEdge } from '@/components/viz/RelationshipGraph'

/* ================================================================ */
/* ThreatPulseStrip (#1)                                             */
/* ================================================================ */
describe('ThreatPulseStrip', () => {
  it('renders the strip container', () => {
    render(<ThreatPulseStrip />)
    expect(screen.getByTestId('threat-pulse-strip')).toBeInTheDocument()
  })

  it('renders Live label', () => {
    render(<ThreatPulseStrip />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('renders ticker content with IOC values', () => {
    render(<ThreatPulseStrip />)
    expect(screen.getByTestId('ticker-content')).toBeInTheDocument()
    // IOC values from mock should appear (doubled for seamless loop)
    const matches = screen.getAllByText('1.2.3.4')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('displays IOC types', () => {
    render(<ThreatPulseStrip />)
    const ipLabels = screen.getAllByText('ip')
    expect(ipLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders severity dots', () => {
    const { container } = render(<ThreatPulseStrip />)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('applies className prop', () => {
    render(<ThreatPulseStrip className="my-strip" />)
    expect(screen.getByTestId('threat-pulse-strip')).toHaveClass('my-strip')
  })

  it('renders nothing visible when no IOC data', async () => {
    const { useIOCs } = await import('@/hooks/use-intel-data')
    vi.mocked(useIOCs).mockReturnValueOnce({ data: { data: [], total: 0 } } as any)
    render(<ThreatPulseStrip />)
    expect(screen.queryByTestId('threat-pulse-strip')).not.toBeInTheDocument()
  })

  it('renders fade edges for visual polish', () => {
    const { container } = render(<ThreatPulseStrip />)
    const gradients = container.querySelectorAll('.bg-gradient-to-r, .bg-gradient-to-l')
    expect(gradients.length).toBe(2)
  })

  it('has overflow hidden on main container', () => {
    render(<ThreatPulseStrip />)
    expect(screen.getByTestId('threat-pulse-strip')).toHaveClass('overflow-hidden')
  })

  it('has h-7 height class', () => {
    render(<ThreatPulseStrip />)
    expect(screen.getByTestId('threat-pulse-strip')).toHaveClass('h-7')
  })
})

/* ================================================================ */
/* RelationshipGraph (#10)                                           */
/* ================================================================ */
describe('RelationshipGraph', () => {
  const nodes: GraphNode[] = [
    { id: '1', type: 'ip', label: '1.2.3.4', primary: true },
    { id: '2', type: 'actor', label: 'APT28' },
    { id: '3', type: 'malware', label: 'Emotet' },
  ]
  const edges: GraphEdge[] = [
    { source: '1', target: '2', label: 'attributed' },
    { source: '1', target: '3', label: 'delivers' },
  ]

  it('renders the graph container', () => {
    render(<RelationshipGraph nodes={nodes} edges={edges} />)
    expect(screen.getByTestId('relationship-graph')).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    const { container } = render(<RelationshipGraph nodes={nodes} edges={edges} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('applies custom dimensions', () => {
    const { container } = render(<RelationshipGraph nodes={nodes} edges={edges} width={300} height={250} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '300')
    expect(svg).toHaveAttribute('height', '250')
  })

  it('shows empty state when no nodes', () => {
    render(<RelationshipGraph nodes={[]} edges={[]} />)
    expect(screen.getByText('No relationships')).toBeInTheDocument()
  })

  it('applies className prop', () => {
    render(<RelationshipGraph nodes={nodes} edges={edges} className="my-graph" />)
    expect(screen.getByTestId('relationship-graph')).toHaveClass('my-graph')
  })

  it('generateStubRelations creates nodes from record', () => {
    const record = {
      id: 'ioc-1', normalizedValue: '1.2.3.4', iocType: 'ip',
      threatActors: ['APT28', 'Lazarus'], malwareFamilies: ['Emotet'],
    }
    const { nodes, edges } = generateStubRelations(record)
    expect(nodes).toHaveLength(4) // primary + 2 actors + 1 malware
    expect(edges).toHaveLength(3)
    expect(nodes[0]!.primary).toBe(true)
  })

  it('generateStubRelations handles empty relations', () => {
    const record = {
      id: 'ioc-2', normalizedValue: 'evil.com', iocType: 'domain',
      threatActors: [], malwareFamilies: [],
    }
    const { nodes, edges } = generateStubRelations(record)
    expect(nodes).toHaveLength(1) // only primary
    expect(edges).toHaveLength(0)
  })

  it('generateStubRelations limits to 3 actors and 3 malware', () => {
    const record = {
      id: 'ioc-3', normalizedValue: 'test', iocType: 'ip',
      threatActors: ['A', 'B', 'C', 'D', 'E'],
      malwareFamilies: ['M1', 'M2', 'M3', 'M4'],
    }
    const { nodes, edges } = generateStubRelations(record)
    // 1 primary + 3 actors + 3 malware = 7
    expect(nodes).toHaveLength(7)
    expect(edges).toHaveLength(6)
  })
})
