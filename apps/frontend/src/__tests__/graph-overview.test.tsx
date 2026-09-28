/**
 * @module __tests__/graph-overview
 * @description Covers the S165 fix: useGraphNodes now calls GET /graph/overview instead of the
 * old always-404ing single-entity lookup, and graph-adapter.ts maps the real threat-graph backend
 * shape (nodeType/fromNodeId/toNodeId/properties) onto the frontend GraphNode/GraphEdge shape.
 * useGraphNodes itself is exercised via its real implementation (only @/lib/api is mocked) so the
 * exact query string and error/success behavior are verified end to end; the page's other data
 * hooks and d3 are stubbed for the ThreatGraphPage overlay tests below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, render, screen } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import * as d3 from 'd3'
import { toGraphSubgraph, type GraphApiSubgraph } from '@/hooks/graph-adapter'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

vi.mock('@/hooks/use-phase4-data', async () => {
  const actual = await vi.importActual<any>('@/hooks/use-phase4-data')
  return {
    ...actual,
    useGraphStats: () => ({ data: { totalNodes: 1, totalEdges: 0, nodesByType: {}, edgesByType: {}, mostConnected: [], isolatedNodes: 0, avgConnections: 0 } }),
    useGraphSearch: () => ({ data: { nodes: [] } }),
    useGraphPath: () => ({ data: null }),
    useNodeNeighbors: () => ({ data: null }),
  }
})

// d3-zoom throws in jsdom (no real viewBox), so d3 is mocked the same way as
// graph-actions.test.tsx / phase4-pages.test.tsx. The "populated" test below inspects the shared
// mock selection's `.text` calls to confirm the label accessor produces the mapped node's label.
vi.mock('d3', () => {
  const sel: any = {}
  ;['selectAll', 'select', 'data', 'join', 'append', 'attr', 'style', 'text', 'on', 'call', 'transition', 'duration', 'remove', 'classed', 'filter'].forEach(k => { sel[k] = vi.fn().mockReturnValue(sel) })
  return {
    select: vi.fn().mockReturnValue(sel),
    zoom: vi.fn().mockReturnValue({ scaleExtent: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis(), transform: {}, scaleBy: vi.fn() }),
    zoomIdentity: { translate: vi.fn().mockReturnValue({ scale: vi.fn().mockReturnValue({ translate: vi.fn() }) }) },
    forceSimulation: vi.fn().mockReturnValue({ force: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis(), alphaTarget: vi.fn().mockReturnThis(), restart: vi.fn(), stop: vi.fn() }),
    forceLink: vi.fn().mockReturnValue({ id: vi.fn().mockReturnThis(), distance: vi.fn().mockReturnThis() }),
    forceManyBody: vi.fn().mockReturnValue({ strength: vi.fn().mockReturnThis() }),
    forceCenter: vi.fn(),
    forceCollide: vi.fn().mockReturnValue({ radius: vi.fn().mockReturnThis() }),
    drag: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis() }),
  }
})

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn(), ToastContainer: () => createElement('div') }))
vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => createElement('div', null, children),
  CompactStat: ({ label, value }: any) => createElement('span', { 'data-testid': `stat-${label}` }, value),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

// ─── toGraphSubgraph ────────────────────────────────────────────

describe('toGraphSubgraph', () => {
  const raw: GraphApiSubgraph = {
    nodes: [
      { id: 'ioc-1', nodeType: 'IOC', riskScore: 80, confidence: 0.9, properties: { value: '1.2.3.4' } },
      { id: 'actor-1', nodeType: 'ThreatActor', riskScore: 95, confidence: 1, properties: { name: 'APT28' } },
      { id: 'vuln-1', nodeType: 'Vulnerability', riskScore: 90, confidence: 0.8, properties: { cveId: 'CVE-2024-1234' } },
      { id: 'no-name-1', nodeType: 'Campaign', riskScore: 50, confidence: 0.5, properties: {} },
      { id: 'infra-1', nodeType: 'Infrastructure', riskScore: 40, confidence: 0.6, properties: { value: 'AS1234' } },
    ],
    edges: [
      { id: 'e1', type: 'COMMUNICATES_WITH', fromNodeId: 'ioc-1', toNodeId: 'infra-1', confidence: 0.7, properties: {} },
    ],
  }
  const result = toGraphSubgraph(raw)

  it('maps IOC properties.value to label and lowercases nodeType', () => {
    const n = result.nodes.find(n => n.id === 'ioc-1')!
    expect(n.entityType).toBe('ioc')
    expect(n.label).toBe('1.2.3.4')
  })

  it('maps ThreatActor properties.name to label', () => {
    const n = result.nodes.find(n => n.id === 'actor-1')!
    expect(n.entityType).toBe('threat_actor')
    expect(n.label).toBe('APT28')
  })

  it('maps Vulnerability properties.cveId to label', () => {
    const n = result.nodes.find(n => n.id === 'vuln-1')!
    expect(n.entityType).toBe('vulnerability')
    expect(n.label).toBe('CVE-2024-1234')
  })

  it('falls back to "<type>:<short id>" when no name field is present', () => {
    const n = result.nodes.find(n => n.id === 'no-name-1')!
    expect(n.label).toBe('campaign:no-name-')
  })

  it('maps lowercase IOC-type labels written by graph-sync (production shape)', () => {
    const prod = toGraphSubgraph({
      nodes: [
        { id: '01602dd4-2d28-41bd-943f-5c229e78aaaa', nodeType: 'cve' as never, riskScore: 0, confidence: 0,
          properties: { firstSeen: '2026-04-13T18:37:12Z', enrichmentStatus: 'enriched' } },
        { id: 'b2', nodeType: 'domain' as never, riskScore: 0, confidence: 0, properties: {} },
        { id: 'b3', nodeType: 'hash_sha256' as never, riskScore: 0, confidence: 0, properties: {} },
      ],
      edges: [],
    })
    expect(prod.nodes.map(n => n.entityType)).toEqual(['vulnerability', 'ioc', 'ioc'])
    expect(prod.nodes[0]!.label).toBe('cve:01602dd4')
  })

  it('maps Infrastructure nodeType', () => {
    const n = result.nodes.find(n => n.id === 'infra-1')!
    expect(n.entityType).toBe('infrastructure')
  })

  it('maps fromNodeId/toNodeId to sourceId/targetId and lowercases relationshipType', () => {
    const e = result.edges[0]!
    expect(e.sourceId).toBe('ioc-1')
    expect(e.targetId).toBe('infra-1')
    expect(e.relationshipType).toBe('communicates_with')
  })

  it('tolerates missing nodes/edges arrays', () => {
    expect(toGraphSubgraph({} as GraphApiSubgraph)).toEqual({ nodes: [], edges: [] })
  })
})

// ─── useGraphNodes (real hook, mocked api) ───────────────────────

describe('useGraphNodes', () => {
  it('calls api with /graph/overview?limit=50 by default and maps the response', async () => {
    mockApi.mockResolvedValueOnce({
      nodes: [{ id: 'n1', nodeType: 'IOC', riskScore: 70, confidence: 0.9, properties: { value: 'evil.com' } }],
      edges: [],
    })
    const { useGraphNodes } = await import('@/hooks/use-phase4-data')
    const { result } = renderHook(() => useGraphNodes(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi).toHaveBeenCalledWith('/graph/overview?limit=50')
    expect(result.current.data?.nodes[0]).toMatchObject({ id: 'n1', entityType: 'ioc', label: 'evil.com' })
  })

  it('uses the given limit', async () => {
    mockApi.mockResolvedValueOnce({ nodes: [], edges: [] })
    const { useGraphNodes } = await import('@/hooks/use-phase4-data')
    const { result } = renderHook(() => useGraphNodes(5), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi).toHaveBeenCalledWith('/graph/overview?limit=5')
  })

  it('surfaces isError with no demo fallback when api rejects', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { useGraphNodes } = await import('@/hooks/use-phase4-data')
    const { result } = renderHook(() => useGraphNodes(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

// ─── ThreatGraphPage overlay states ─────────────────────────────

describe('ThreatGraphPage — loading/error/empty overlay', () => {
  it('shows graph-loading while the query is pending', async () => {
    mockApi.mockImplementation(() => new Promise(() => {})) // never resolves
    const { ThreatGraphPage } = await import('@/pages/ThreatGraphPage')
    render(<ThreatGraphPage />)
    expect(screen.getByTestId('graph-loading')).toBeTruthy()
  })

  it('shows graph-error with a Retry button when the query fails', async () => {
    mockApi.mockRejectedValue(new Error('boom'))
    const { ThreatGraphPage } = await import('@/pages/ThreatGraphPage')
    render(<ThreatGraphPage />)
    await waitFor(() => expect(screen.getByTestId('graph-error')).toBeTruthy())
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('shows graph-empty when the query succeeds with zero nodes', async () => {
    mockApi.mockResolvedValue({ nodes: [], edges: [] })
    const { ThreatGraphPage } = await import('@/pages/ThreatGraphPage')
    render(<ThreatGraphPage />)
    await waitFor(() => expect(screen.getByTestId('graph-empty')).toBeTruthy())
  })

  it('shows no overlay and renders a node label when populated', async () => {
    mockApi.mockResolvedValue({
      nodes: [{ id: 'n1', nodeType: 'IOC', riskScore: 80, confidence: 0.9, properties: { value: 'evil.com' } }],
      edges: [],
    })
    const { ThreatGraphPage } = await import('@/pages/ThreatGraphPage')
    render(<ThreatGraphPage />)
    await waitFor(() => expect(screen.queryByTestId('graph-loading')).toBeFalsy())
    expect(screen.queryByTestId('graph-error')).toBeFalsy()
    expect(screen.queryByTestId('graph-empty')).toBeFalsy()
    // d3 is mocked, so no real SVG text is in the DOM — instead verify the label accessor
    // passed to the shared mock selection's `.text()` produces the mapped node's label.
    const sel = (d3.select as any)()
    const labelFn = sel.text.mock.calls
      .map((call: any[]) => call[0])
      .find((fn: unknown) => typeof fn === 'function' && fn({ label: 'evil.com' }) === 'evil.com')
    expect(labelFn).toBeTruthy()
  })
})
