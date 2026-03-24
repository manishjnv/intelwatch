/**
 * @module pages/ThreatGraphPage
 * @description Interactive threat graph visualization using D3 force-directed layout.
 * G2: Path Finder, G3: Add Node, G6: Node size=risk, G7: Edge thickness=confidence,
 * G10: STIX export. Plus: risk propagation, entity legend, search, zoom.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'
import {
  useGraphNodes, useGraphStats, useGraphSearch, useGraphPath,
  useNodeNeighbors,
  type GraphNode, type GraphEdge,
} from '@/hooks/use-phase4-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  GitBranch, Search, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Plus, Route,
} from 'lucide-react'
import { toast, ToastContainer } from '@/components/ui/Toast'
import {
  NODE_COLORS, EntityLegend, NodeDetailPanel,
  PathFinderBar, AddNodeModal, GraphContextMenu,
} from '@/components/viz/GraphWidgets'

// ─── D3 Simulation Types ────────────────────────────────────────

interface SimNode extends d3.SimulationNodeDatum {
  id: string; entityType: string; label: string; riskScore: number
  properties: Record<string, unknown>; createdAt: string
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string; relationshipType: string; confidence: number
}

// ─── Main Graph Component ───────────────────────────────────────

export function ThreatGraphPage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [removedNodeIds, setRemovedNodeIds] = useState<Set<string>>(new Set())
  const [edgeTooltip, setEdgeTooltip] = useState<{ x: number; y: number; type: string; confidence: number } | null>(null)
  const [expandNodeId, setExpandNodeId] = useState<string | null>(null)
  const [mergedNodes, setMergedNodes] = useState<GraphNode[]>([])
  const [mergedEdges, setMergedEdges] = useState<GraphEdge[]>([])

  // Path Finder state
  const [pathFinderActive, setPathFinderActive] = useState(false)
  const [pathSourceId, setPathSourceId] = useState<string | null>(null)
  const [pathTargetId, setPathTargetId] = useState<string | null>(null)

  const { data: graphData, isDemo } = useGraphNodes()
  const { data: graphStats } = useGraphStats()
  const { data: searchResults } = useGraphSearch(searchQuery)
  const { data: pathResult } = useGraphPath(pathSourceId, pathTargetId)
  const { data: neighborData } = useNodeNeighbors(expandNodeId)

  // Merge neighbor data when expand completes
  useEffect(() => {
    if (!neighborData || !expandNodeId) return
    const newNodes = neighborData.nodes ?? []
    const newEdges = neighborData.edges ?? []
    if (newNodes.length > 0) {
      setMergedNodes(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        return [...prev, ...newNodes.filter(n => !existingIds.has(n.id))]
      })
      setMergedEdges(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        return [...prev, ...newEdges.filter(e => !existingIds.has(e.id))]
      })
      toast(`Expanded ${newNodes.length} neighbors`, 'success')
    } else {
      toast('No neighbors found', 'info')
    }
    setExpandNodeId(null)
  }, [neighborData, expandNodeId])

  const baseNodes = graphData?.nodes ?? []
  const baseEdges = graphData?.edges ?? []

  // Combine base graph + expanded neighbors
  const allNodes = useMemo(() => {
    if (mergedNodes.length === 0) return baseNodes
    const ids = new Set(baseNodes.map(n => n.id))
    return [...baseNodes, ...mergedNodes.filter(n => !ids.has(n.id))]
  }, [baseNodes, mergedNodes])

  const allEdges = useMemo(() => {
    if (mergedEdges.length === 0) return baseEdges
    const ids = new Set(baseEdges.map(e => e.id))
    return [...baseEdges, ...mergedEdges.filter(e => !ids.has(e.id))]
  }, [baseEdges, mergedEdges])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of allNodes) counts[n.entityType] = (counts[n.entityType] ?? 0) + 1
    return counts
  }, [allNodes])

  const filteredNodes = useMemo(() => {
    let nodes = allNodes
    if (removedNodeIds.size > 0) nodes = nodes.filter(n => !removedNodeIds.has(n.id))
    if (typeFilter) nodes = nodes.filter(n => n.entityType === typeFilter)
    if (searchQuery && searchResults?.nodes?.length) {
      const ids = new Set(searchResults.nodes.map(n => n.id))
      nodes = nodes.filter(n => ids.has(n.id))
    }
    return nodes
  }, [allNodes, typeFilter, searchQuery, searchResults, removedNodeIds])

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    return allEdges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
  }, [allEdges, filteredNodes])

  const selectedNode = useMemo(
    () => allNodes.find(n => n.id === selectedNodeId) ?? null,
    [allNodes, selectedNodeId],
  )

  // Path finder node IDs for highlighting
  const pathNodeIds = useMemo(() => {
    if (!pathResult?.nodes?.length) return new Set<string>()
    return new Set(pathResult.nodes.map(n => n.id))
  }, [pathResult])

  const pathEdgeIds = useMemo(() => {
    if (!pathResult?.edges?.length) return new Set<string>()
    return new Set(pathResult.edges.map(e => e.id))
  }, [pathResult])

  const sourceLabel = useMemo(
    () => allNodes.find(n => n.id === pathSourceId)?.label ?? null,
    [allNodes, pathSourceId],
  )

  // Handle node click — path finder or normal select
  const handleNodeClick = useCallback((nodeId: string) => {
    if (pathFinderActive) {
      if (!pathSourceId) {
        setPathSourceId(nodeId)
      } else if (nodeId !== pathSourceId) {
        setPathTargetId(nodeId)
      }
      return
    }
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId)
  }, [pathFinderActive, pathSourceId])

  const handlePathFind = useCallback((nodeId: string) => {
    setPathFinderActive(true)
    setPathSourceId(nodeId)
    setPathTargetId(null)
    setSelectedNodeId(null)
  }, [])

  const cancelPathFinder = useCallback(() => {
    setPathFinderActive(false)
    setPathSourceId(null)
    setPathTargetId(null)
  }, [])

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen(); setIsFullscreen(false)
    } else {
      containerRef.current.requestFullscreen(); setIsFullscreen(true)
    }
  }, [])

  const handleContextAction = useCallback((action: string, nodeId: string) => {
    setContextMenu(null)
    const node = allNodes.find(n => n.id === nodeId)
    if (!node) return
    switch (action) {
      case 'path': handlePathFind(nodeId); break
      case 'expand': setExpandNodeId(nodeId); break
      case 'remove': setRemovedNodeIds(prev => new Set([...prev, nodeId])); break
      case 'copy': navigator.clipboard.writeText(node.label); toast('Copied to clipboard'); break
    }
  }, [allNodes, handlePathFind])

  // ─── D3 Force Simulation ──────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || filteredNodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const { width, height } = containerRef.current.getBoundingClientRect()
    svg.selectAll('*').remove()
    // Glow filter + animation CSS for path highlighting
    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'path-glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')
    defs.append('style').text(
      '.path-edge-anim{animation:dashMove .8s linear infinite}' +
      '@keyframes dashMove{to{stroke-dashoffset:-12}}' +
      '.path-pulse{animation:nodePulse 1.5s ease-in-out infinite}' +
      '@keyframes nodePulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.3}}',
    )
    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    const simNodes: SimNode[] = filteredNodes.map(n => ({ ...n }))
    const simLinks: SimLink[] = filteredEdges.map(e => ({
      ...e, source: e.sourceId, target: e.targetId,
    }))

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => 10 + d.riskScore / 10))

    // G7: Edge thickness = confidence + hover tooltip
    const link = g.append('g').selectAll('line').data(simLinks).join('line')
      .attr('stroke', 'var(--border)')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', d => Math.max(1, d.confidence / 30))
      .attr('cursor', 'pointer')
      .on('mouseover', function (event: any, d: SimLink) {
        d3.select(this).attr('stroke-opacity', 0.9).attr('stroke-width', Math.max(2, d.confidence / 20))
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) setEdgeTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 32, type: d.relationshipType.replace(/_/g, ' '), confidence: d.confidence })
      })
      .on('mouseout', function (_e: any, d: SimLink) {
        d3.select(this).attr('stroke-opacity', 0.5).attr('stroke-width', Math.max(1, d.confidence / 30))
        setEdgeTooltip(null)
      })

    // Hidden labels (positioned on tick for edge tooltip fallback)
    const linkLabel = g.append('g').selectAll('text').data(simLinks).join('text')
      .attr('font-size', '0').attr('opacity', 0)

    const node = g.append('g').selectAll('g').data(simNodes).join('g')
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

    // G6: Node size = risk score (radius 8-20)
    const nodeRadius = (d: SimNode) => 8 + (d.riskScore / 100) * 12

    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => NODE_COLORS[d.entityType] ?? '#666')
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => NODE_COLORS[d.entityType] ?? '#666')
      .attr('stroke-width', 1.5)

    node.append('circle')
      .attr('r', d => 2 + (d.riskScore / 100) * 3)
      .attr('fill', d => NODE_COLORS[d.entityType] ?? '#666')

    node.append('text')
      .text(d => d.label.length > 18 ? d.label.slice(0, 16) + '...' : d.label)
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', 'var(--text-secondary)')

    // Hover
    node.on('mouseover', function (_event, d) {
      setHoveredNodeId(d.id)
      d3.select(this).select('circle:first-child')
        .transition().duration(200).attr('fill-opacity', 0.35).attr('stroke-width', 2.5)
      link.attr('stroke-opacity', l => {
        const s = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
        const t = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
        return s === d.id || t === d.id ? 0.9 : 0.12
      }).attr('stroke', l => {
        const s = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
        const t = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
        return s === d.id || t === d.id ? NODE_COLORS[d.entityType] ?? '#666' : 'var(--border)'
      })
    }).on('mouseout', function () {
      setHoveredNodeId(null)
      d3.select(this).select('circle:first-child')
        .transition().duration(200).attr('fill-opacity', 0.15).attr('stroke-width', 1.5)
      link.attr('stroke-opacity', 0.5).attr('stroke', 'var(--border)')
    }).on('click', (_event, d) => handleNodeClick(d.id))
      .on('contextmenu', (event: any, d: SimNode) => {
        event.preventDefault()
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, nodeId: d.id })
      })

    // Path highlighting with glow + animated dash + pulse
    if (pathNodeIds.size > 0) {
      node.select('circle:first-child')
        .attr('stroke-width', d => pathNodeIds.has(d.id) ? 3.5 : 1)
        .attr('fill-opacity', d => pathNodeIds.has(d.id) ? 0.4 : 0.06)
        .attr('stroke', d => pathNodeIds.has(d.id) ? '#22c55e' : NODE_COLORS[d.entityType] ?? '#666')
      // Pulse source + destination nodes
      const pathArr = Array.from(pathNodeIds)
      if (pathArr.length >= 2) {
        node.filter((d: SimNode) => d.id === pathArr[0] || d.id === pathArr[pathArr.length - 1])
          .select('circle:first-child')
          .attr('stroke', '#22c55e').attr('stroke-width', 4.5)
          .classed('path-pulse', true)
      }
      // Glow + animated dash on path edges
      link
        .attr('stroke', l => pathEdgeIds.has(l.id) ? '#22c55e' : 'var(--border)')
        .attr('stroke-opacity', l => pathEdgeIds.has(l.id) ? 1 : 0.15)
        .attr('stroke-width', l => pathEdgeIds.has(l.id) ? 3.5 : 1)
        .attr('filter', l => pathEdgeIds.has(l.id) ? 'url(#path-glow)' : null)
        .attr('stroke-dasharray', l => pathEdgeIds.has(l.id) ? '8 4' : null)
      link.filter((l: SimLink) => pathEdgeIds.has(l.id)).classed('path-edge-anim', true)
    } else if (selectedNodeId) {
      // Risk propagation highlight
      const neighborIds = new Set<string>()
      for (const e of simLinks) {
        const s = typeof e.source === 'object' ? (e.source as SimNode).id : e.source
        const t = typeof e.target === 'object' ? (e.target as SimNode).id : e.target
        if (s === selectedNodeId) neighborIds.add(t as string)
        if (t === selectedNodeId) neighborIds.add(s as string)
      }
      node.select('circle:first-child')
        .attr('stroke-width', d => d.id === selectedNodeId ? 3.5 : neighborIds.has(d.id) ? 2.5 : 1.5)
        .attr('fill-opacity', d => d.id === selectedNodeId ? 0.4 : neighborIds.has(d.id) ? 0.25 : 0.1)
    }

    simulation.on('tick', () => {
      link.attr('x1', d => (d.source as SimNode).x ?? 0).attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0).attr('y2', d => (d.target as SimNode).y ?? 0)
      linkLabel.attr('x', d => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', d => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.85))
    return () => { simulation.stop() }
  }, [filteredNodes, filteredEdges, selectedNodeId, pathNodeIds, pathEdgeIds, handleNodeClick])

  const handleZoom = useCallback((factor: number) => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const z = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
    svg.transition().duration(300).call(z.scaleBy as any, factor)
  }, [])

  const handleFitView = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return
    const svg = d3.select(svgRef.current)
    const { width, height } = containerRef.current.getBoundingClientRect()
    const z = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
    svg.transition().duration(500)
      .call(z.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.7).translate(-width / 2, -height / 2))
  }, [])

  return (
    <div className="flex flex-col h-full">
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo graph — connect Graph service for live data</span>
        </div>
      )}

      <PageStatsBar>
        <CompactStat label="Nodes" value={graphStats?.totalNodes?.toString() ?? '—'} />
        <CompactStat label="Edges" value={graphStats?.totalEdges?.toString() ?? '—'} />
        <CompactStat label="Avg Risk" value={graphStats?.avgRiskScore?.toString() ?? '—'} color="text-sev-high" />
      </PageStatsBar>

      {/* Controls bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-bg-secondary border border-border rounded-md px-2 py-1 flex-1 max-w-xs">
          <Search className="w-3 h-3 text-text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities..." className="bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none w-full" />
        </div>

        <EntityLegend counts={typeCounts} activeFilter={typeFilter} onFilter={setTypeFilter} />

        <div className="flex items-center gap-1 ml-auto">
          {/* G2: Path Finder toggle */}
          <button onClick={() => pathFinderActive ? cancelPathFinder() : setPathFinderActive(true)}
            className={cn('p-1.5 rounded border text-text-muted hover:text-text-primary', pathFinderActive ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-bg-hover')}
            title="Path Finder">
            <Route className="w-3.5 h-3.5" />
          </button>
          {/* G3: Add Node */}
          <button onClick={() => setShowAddNode(true)}
            className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Add Node">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleZoom(1.3)} className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Zoom In">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleZoom(0.7)} className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Zoom Out">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleFitView} className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover" title="Fit View">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleFullscreen}
            className={cn('p-1.5 rounded border text-text-muted hover:text-text-primary hover:bg-bg-hover', isFullscreen ? 'border-accent bg-accent/10 text-accent' : 'border-border')}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* G2: Path Finder status bar */}
      <PathFinderBar active={pathFinderActive} sourceLabel={sourceLabel}
        onCancel={cancelPathFinder} pathResult={pathResult ?? null} />

      {/* Graph area */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={containerRef} className="flex-1 relative bg-bg-base">
          <svg ref={svgRef} className="w-full h-full" />
          {filteredNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-text-muted">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No graph data available</p>
                <p className="text-xs mt-1">Connect the Threat Graph service or clear filters</p>
              </div>
            </div>
          )}
          {/* Edge hover tooltip */}
          {edgeTooltip && (
            <div className="absolute bg-bg-primary border border-border rounded-lg px-2 py-1.5 shadow-lg pointer-events-none z-10"
              style={{ left: edgeTooltip.x, top: edgeTooltip.y, transform: 'translateX(-50%)' }}>
              <div className="text-[10px] font-medium text-text-primary capitalize">{edgeTooltip.type}</div>
              <div className="text-[9px] text-text-muted tabular-nums">Weight: {edgeTooltip.confidence}%</div>
            </div>
          )}
          {/* Right-click context menu */}
          {contextMenu && (
            <GraphContextMenu x={contextMenu.x} y={contextMenu.y} nodeId={contextMenu.nodeId}
              onAction={handleContextAction} onClose={() => setContextMenu(null)} />
          )}
          {hoveredNodeId && !selectedNodeId && (
            <div className="absolute top-3 left-3 bg-bg-primary border border-border rounded-lg p-2 shadow-lg text-[11px] pointer-events-none">
              {(() => {
                const n = allNodes.find(n => n.id === hoveredNodeId)
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

        {selectedNode && (
          <NodeDetailPanel node={selectedNode} edges={allEdges} allNodes={allNodes}
            onClose={() => setSelectedNodeId(null)} onPathFind={handlePathFind} />
        )}
      </div>

      <AddNodeModal open={showAddNode} onClose={() => setShowAddNode(false)} />
      <ToastContainer />
    </div>
  )
}
