/**
 * @module pages/ThreatGraphPage
 * @description Interactive threat graph visualization using D3 force-directed layout.
 * Nodes: IOC, Actor, Malware, Vulnerability, Campaign.
 * Improvements: #6 risk propagation animation, #7 path finder, #8 entity legend with counts.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import {
  useGraphNodes, useGraphStats, useGraphSearch,
  type GraphNode, type GraphEdge,
} from '@/hooks/use-phase4-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  GitBranch, Search, ZoomIn, ZoomOut, Maximize2,
  X, Crosshair, Target, Bug, AlertTriangle, Layers,
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  ioc: '#3b82f6',
  threat_actor: '#ef4444',
  malware: '#f59e0b',
  vulnerability: '#a855f7',
  campaign: '#06b6d4',
}

const NODE_LABELS: Record<string, string> = {
  ioc: 'IOC',
  threat_actor: 'Threat Actor',
  malware: 'Malware',
  vulnerability: 'Vulnerability',
  campaign: 'Campaign',
}

const NODE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  ioc: Target,
  threat_actor: Crosshair,
  malware: Bug,
  vulnerability: AlertTriangle,
  campaign: Layers,
}

// ─── D3 Simulation Types ────────────────────────────────────────

interface SimNode extends d3.SimulationNodeDatum {
  id: string; entityType: string; label: string; riskScore: number
  properties: Record<string, unknown>; createdAt: string
  fx?: number | null; fy?: number | null
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string; relationshipType: string; confidence: number
}

// ─── #8: Entity Legend with Live Counts ─────────────────────────

function EntityLegend({
  counts, activeFilter, onFilter,
}: {
  counts: Record<string, number>
  activeFilter: string | null
  onFilter: (type: string | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(NODE_COLORS).map(([type, color]) => {
        const Icon = NODE_ICONS[type] ?? Target
        const count = counts[type] ?? 0
        const isActive = activeFilter === type
        return (
          <button
            key={type}
            onClick={() => onFilter(isActive ? null : type)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all border',
              isActive
                ? 'border-current bg-current/10'
                : 'border-border hover:border-current/40 bg-bg-secondary',
            )}
            style={{ color }}
          >
            <Icon className="w-3 h-3" />
            {NODE_LABELS[type]}
            <span className="tabular-nums opacity-70">{count}</span>
          </button>
        )
      })}
      {activeFilter && (
        <button
          onClick={() => onFilter(null)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-text-muted hover:text-text-primary border border-border"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  )
}

// ─── Node Detail Panel ──────────────────────────────────────────

function NodeDetailPanel({ node, edges, allNodes, onClose }: {
  node: GraphNode; edges: GraphEdge[]; allNodes: GraphNode[]; onClose: () => void
}) {
  const related = edges.filter(e => e.sourceId === node.id || e.targetId === node.id)
  const riskColor = node.riskScore >= 70 ? 'text-sev-critical' : node.riskScore >= 40 ? 'text-sev-medium' : 'text-sev-low'

  return (
    <div className="w-80 bg-bg-primary border-l border-border h-full overflow-y-auto">
      <div className="sticky top-0 bg-bg-primary border-b border-border p-3 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS[node.entityType] }} />
            <span className="text-[10px] uppercase text-text-muted">{NODE_LABELS[node.entityType]}</span>
          </div>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-text-primary break-all">{node.label}</h3>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
          <span>Risk: <span className={cn('font-bold tabular-nums', riskColor)}>{node.riskScore}</span></span>
          <span>{related.length} connections</span>
        </div>
      </div>

      {/* Properties */}
      {Object.keys(node.properties).length > 0 && (
        <div className="p-3 border-b border-border">
          <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Properties</h4>
          <div className="space-y-1">
            {Object.entries(node.properties).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-text-muted">{k}</span>
                <span className="text-text-primary font-mono truncate ml-2 max-w-[160px]">
                  {Array.isArray(v) ? v.join(', ') : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      <div className="p-3">
        <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Relationships</h4>
        <div className="space-y-1.5">
          {related.map(edge => {
            const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId
            const other = allNodes.find(n => n.id === otherId)
            const direction = edge.sourceId === node.id ? '→' : '←'
            return (
              <div key={edge.id} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-bg-secondary">
                <div className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: NODE_COLORS[other?.entityType ?? 'ioc'] }} />
                <span className="text-text-muted">{direction}</span>
                <span className="text-text-primary truncate flex-1">{other?.label ?? otherId}</span>
                <span className="text-[9px] text-text-muted shrink-0">{edge.relationshipType.replace('_', ' ')}</span>
                <span className="text-[9px] tabular-nums text-text-muted">{edge.confidence}%</span>
              </div>
            )
          })}
          {related.length === 0 && (
            <p className="text-[11px] text-text-muted">No relationships found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Graph Component ───────────────────────────────────────

export function ThreatGraphPage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const { data: graphData, isDemo } = useGraphNodes()
  const { data: graphStats } = useGraphStats()
  const { data: searchResults } = useGraphSearch(searchQuery)

  // Node counts by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of graphData?.nodes ?? []) {
      counts[n.entityType] = (counts[n.entityType] ?? 0) + 1
    }
    return counts
  }, [graphData])

  // Filter nodes
  const filteredNodes = useMemo(() => {
    let nodes = graphData?.nodes ?? []
    if (typeFilter) nodes = nodes.filter(n => n.entityType === typeFilter)
    if (searchQuery && searchResults?.nodes?.length) {
      const ids = new Set(searchResults.nodes.map(n => n.id))
      nodes = nodes.filter(n => ids.has(n.id))
    }
    return nodes
  }, [graphData, typeFilter, searchQuery, searchResults])

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    return (graphData?.edges ?? []).filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
  }, [graphData, filteredNodes])

  const selectedNode = useMemo(
    () => (graphData?.nodes ?? []).find(n => n.id === selectedNodeId) ?? null,
    [graphData, selectedNodeId],
  )

  // D3 force simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (filteredNodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const { width, height } = containerRef.current.getBoundingClientRect()

    svg.selectAll('*').remove()

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    const simNodes: SimNode[] = filteredNodes.map(n => ({ ...n }))
    const simLinks: SimLink[] = filteredEdges.map(e => ({
      ...e,
      source: e.sourceId,
      target: e.targetId,
    }))

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(25))

    simulationRef.current = simulation

    // Edges
    const link = g.append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'var(--border)')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', d => Math.max(1, d.confidence / 40))

    // Edge labels
    const linkLabel = g.append('g')
      .selectAll('text')
      .data(simLinks)
      .join('text')
      .text(d => d.relationshipType.replace(/_/g, ' '))
      .attr('font-size', '8px')
      .attr('fill', 'var(--text-muted)')
      .attr('text-anchor', 'middle')
      .attr('opacity', 0.6)

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event: any, d: any) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
        }) as any,
      )

    // Node circles
    node.append('circle')
      .attr('r', d => 6 + d.riskScore / 15)
      .attr('fill', d => NODE_COLORS[d.entityType] ?? '#666')
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => NODE_COLORS[d.entityType] ?? '#666')
      .attr('stroke-width', 1.5)

    // Node center dot
    node.append('circle')
      .attr('r', 3)
      .attr('fill', d => NODE_COLORS[d.entityType] ?? '#666')

    // Node labels
    node.append('text')
      .text(d => d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label)
      .attr('dy', d => 14 + d.riskScore / 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', 'var(--text-secondary)')

    // Hover & click
    node.on('mouseover', function (_event, d) {
      setHoveredNodeId(d.id)
      d3.select(this).select('circle:first-child')
        .transition().duration(200)
        .attr('fill-opacity', 0.3)
        .attr('stroke-width', 2.5)
      // Highlight connected edges
      link.attr('stroke-opacity', l => {
        const s = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
        const t = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
        return s === d.id || t === d.id ? 0.9 : 0.15
      }).attr('stroke', l => {
        const s = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
        const t = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
        return s === d.id || t === d.id ? NODE_COLORS[d.entityType] ?? '#666' : 'var(--border)'
      })
    }).on('mouseout', function () {
      setHoveredNodeId(null)
      d3.select(this).select('circle:first-child')
        .transition().duration(200)
        .attr('fill-opacity', 0.15)
        .attr('stroke-width', 1.5)
      link.attr('stroke-opacity', 0.5).attr('stroke', 'var(--border)')
    }).on('click', (_event, d) => {
      setSelectedNodeId(prev => prev === d.id ? null : d.id)
    })

    // #6: Risk propagation — highlight selected node's neighborhood
    if (selectedNodeId) {
      const selectedNeighborIds = new Set<string>()
      for (const e of simLinks) {
        const s = typeof e.source === 'object' ? (e.source as SimNode).id : e.source
        const t = typeof e.target === 'object' ? (e.target as SimNode).id : e.target
        if (s === selectedNodeId) selectedNeighborIds.add(t as string)
        if (t === selectedNodeId) selectedNeighborIds.add(s as string)
      }
      node.select('circle:first-child')
        .attr('stroke-width', d =>
          d.id === selectedNodeId ? 3 : selectedNeighborIds.has(d.id) ? 2.5 : 1.5,
        )
        .attr('fill-opacity', d =>
          d.id === selectedNodeId ? 0.4 : selectedNeighborIds.has(d.id) ? 0.25 : 0.1,
        )
    }

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)
      linkLabel
        .attr('x', d => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', d => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    // Fit to view
    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.9))

    return () => { simulation.stop() }
  }, [filteredNodes, filteredEdges, selectedNodeId])

  // Zoom controls
  const handleZoom = useCallback((factor: number) => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
    svg.transition().duration(300).call(zoom.scaleBy as any, factor)
  }, [])

  const handleFitView = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return
    const svg = d3.select(svgRef.current)
    const { width, height } = containerRef.current.getBoundingClientRect()
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
    svg.transition().duration(500)
      .call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.7).translate(-width / 2, -height / 2))
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo graph — connect Graph service for live data</span>
        </div>
      )}

      {/* Stats */}
      <PageStatsBar>
        <CompactStat label="Nodes" value={graphStats?.totalNodes?.toString() ?? '—'} />
        <CompactStat label="Edges" value={graphStats?.totalEdges?.toString() ?? '—'} />
        <CompactStat label="Avg Risk" value={graphStats?.avgRiskScore?.toString() ?? '—'} color="text-sev-high" />
      </PageStatsBar>

      {/* Controls bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-bg-secondary border border-border rounded-md px-2 py-1 flex-1 max-w-xs">
          <Search className="w-3 h-3 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities…"
            className="bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none w-full"
          />
        </div>

        {/* #8: Entity Legend */}
        <EntityLegend counts={typeCounts} activeFilter={typeFilter} onFilter={setTypeFilter} />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => handleZoom(1.3)} className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Zoom In">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleZoom(0.7)} className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Zoom Out">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleFitView} className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Fit View">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Graph area */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={containerRef} className="flex-1 relative bg-bg-base">
          <svg ref={svgRef} className="w-full h-full" />

          {/* Empty state */}
          {filteredNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-text-muted">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No graph data available</p>
                <p className="text-xs mt-1">Connect the Threat Graph service or clear filters</p>
              </div>
            </div>
          )}

          {/* Hovered node tooltip */}
          {hoveredNodeId && !selectedNodeId && (
            <div className="absolute top-3 left-3 bg-bg-primary border border-border rounded-lg p-2 shadow-lg text-[11px] pointer-events-none">
              {(() => {
                const n = (graphData?.nodes ?? []).find(n => n.id === hoveredNodeId)
                if (!n) return null
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS[n.entityType] }} />
                    <span className="text-text-primary font-medium">{n.label}</span>
                    <span className="text-text-muted">Risk: {n.riskScore}</span>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            edges={graphData?.edges ?? []}
            allNodes={graphData?.nodes ?? []}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}
