/**
 * @module components/viz/RelationshipGraph
 * @description Mini D3 force-directed relationship graph — shows entity
 * connections in a compact visual. P1-10.
 */
import { useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'

export interface GraphNode {
  id: string
  type: string
  label: string
  primary?: boolean
}

export interface GraphEdge {
  source: string
  target: string
  label?: string
}

interface RelationshipGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
  className?: string
}

const NODE_COLOR: Record<string, string> = {
  ip: '#3b82f6',
  domain: '#a855f7',
  url: '#06b6d4',
  hash: '#64748b',
  cve: '#f97316',
  actor: '#ef4444',
  malware: '#ec4899',
  email: '#22c55e',
  default: '#94a3b8',
}

export function RelationshipGraph({
  nodes,
  edges,
  width = 280,
  height = 200,
  className,
}: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')

    // Clone data so D3 mutation doesn't affect React
    const simNodes = nodes.map(n => ({ ...n })) as (GraphNode & d3.SimulationNodeDatum)[]
    const simEdges = edges.map(e => ({ ...e })) as (GraphEdge & d3.SimulationLinkDatum<GraphNode & d3.SimulationNodeDatum>)[]

    const simulation = d3
      .forceSimulation(simNodes)
      .force('link', d3.forceLink(simEdges).id((d: any) => d.id).distance(50))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(18))

    // Links
    const link = g
      .selectAll('line')
      .data(simEdges)
      .enter()
      .append('line')
      .attr('stroke', 'var(--border-strong)')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5)

    // Nodes
    const node = g
      .selectAll('circle')
      .data(simNodes)
      .enter()
      .append('circle')
      .attr('r', (d: any) => (d.primary ? 10 : 6))
      .attr('fill', (d: any) => NODE_COLOR[d.type] ?? NODE_COLOR.default)
      .attr('stroke', (d: any) => (d.primary ? '#fff' : 'none'))
      .attr('stroke-width', (d: any) => (d.primary ? 2 : 0))
      .attr('cursor', 'pointer')

    // Labels
    const labels = g
      .selectAll('text')
      .data(simNodes)
      .enter()
      .append('text')
      .text((d: any) => d.label.length > 12 ? d.label.slice(0, 10) + '…' : d.label)
      .attr('font-size', 8)
      .attr('fill', 'var(--text-secondary)')
      .attr('text-anchor', 'middle')
      .attr('dy', -12)

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      labels.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, width, height])

  if (nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-xs text-text-muted', className)} style={{ width, height }}>
        No relationships
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border bg-bg-secondary/30 overflow-hidden', className)} data-testid="relationship-graph">
      <svg ref={svgRef} width={width} height={height} />
    </div>
  )
}

/** Generate stub relationship data from an IOC record */
export function generateStubRelations(record: { id: string; normalizedValue: string; iocType: string; threatActors: string[]; malwareFamilies: string[] }): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [
    { id: record.id, type: record.iocType, label: record.normalizedValue, primary: true },
  ]
  const edges: GraphEdge[] = []

  record.threatActors.slice(0, 3).forEach((actor, i) => {
    const nodeId = `actor-${i}`
    nodes.push({ id: nodeId, type: 'actor', label: actor })
    edges.push({ source: record.id, target: nodeId, label: 'attributed' })
  })

  record.malwareFamilies.slice(0, 3).forEach((mal, i) => {
    const nodeId = `malware-${i}`
    nodes.push({ id: nodeId, type: 'malware', label: mal })
    edges.push({ source: record.id, target: nodeId, label: 'delivers' })
  })

  return { nodes, edges }
}
