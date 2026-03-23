/**
 * @module components/viz/GraphWidgets
 * @description Extracted widgets for Threat Graph page:
 * Entity Legend, Node Detail Panel, Path Finder controls, Add Node modal.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useCreateGraphNode, useStixExport,
  type GraphNode, type GraphEdge,
} from '@/hooks/use-phase4-data'
import {
  X, Crosshair, Target, Bug, AlertTriangle, Layers,
  Plus, Download, Route,
} from 'lucide-react'

// ─── Constants (shared with ThreatGraphPage) ────────────────────

export const NODE_COLORS: Record<string, string> = {
  ioc: '#3b82f6',
  threat_actor: '#ef4444',
  malware: '#f59e0b',
  vulnerability: '#a855f7',
  campaign: '#06b6d4',
}

export const NODE_LABELS: Record<string, string> = {
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

// ─── Entity Legend with Live Counts ─────────────────────────────

export function EntityLegend({
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

export function NodeDetailPanel({ node, edges, allNodes, onClose, onPathFind }: {
  node: GraphNode; edges: GraphEdge[]; allNodes: GraphNode[]
  onClose: () => void; onPathFind: (nodeId: string) => void
}) {
  const related = edges.filter(e => e.sourceId === node.id || e.targetId === node.id)
  const riskColor = node.riskScore >= 70 ? 'text-sev-critical' : node.riskScore >= 40 ? 'text-sev-medium' : 'text-sev-low'
  const stixExport = useStixExport()

  const handleExportStix = () => {
    stixExport.mutate({ nodeId: node.id, depth: 2 }, {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `stix-${node.label.replace(/[^a-z0-9]/gi, '_')}.json`
        a.click(); URL.revokeObjectURL(url)
      },
    })
  }

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
        {/* Action buttons */}
        <div className="flex items-center gap-1.5 mt-2">
          <button onClick={() => onPathFind(node.id)}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            <Route className="w-3 h-3" />Find Path
          </button>
          <button onClick={handleExportStix} disabled={stixExport.isPending}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-bg-secondary border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50">
            <Download className="w-3 h-3" />STIX
          </button>
        </div>
      </div>

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

// ─── Path Finder Bar ────────────────────────────────────────────

export function PathFinderBar({ active, sourceLabel, onCancel, pathResult }: {
  active: boolean; sourceLabel: string | null
  onCancel: () => void
  pathResult: { nodes: GraphNode[]; edges: GraphEdge[]; hops: number } | null
}) {
  if (!active) return null
  return (
    <div className="px-4 py-2 bg-accent/5 border-b border-accent/20 flex items-center gap-3">
      <Route className="w-4 h-4 text-accent" />
      <span className="text-xs text-text-primary">
        <span className="font-medium">Path Finder</span>
        {sourceLabel
          ? <> — From <span className="text-accent font-medium">{sourceLabel}</span>. Click a destination node.</>
          : <> — Click a source node to start.</>
        }
      </span>
      {pathResult && pathResult.nodes.length > 0 && (
        <span className="text-[10px] text-sev-low font-medium ml-2">
          Path found: {pathResult.hops} hops, {pathResult.nodes.length} nodes
        </span>
      )}
      {pathResult && pathResult.nodes.length === 0 && sourceLabel && (
        <span className="text-[10px] text-sev-medium ml-2">No path found</span>
      )}
      <button onClick={onCancel} className="ml-auto text-[10px] px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary">
        Cancel
      </button>
    </div>
  )
}

// ─── Add Node Modal ─────────────────────────────────────────────

export function AddNodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entityType, setEntityType] = useState('ioc')
  const [label, setLabel] = useState('')
  const [riskScore, setRiskScore] = useState(50)
  const createMutation = useCreateGraphNode()

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return
    createMutation.mutate({ entityType, label: label.trim(), riskScore }, {
      onSuccess: () => { setLabel(''); setRiskScore(50); onClose() },
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-bg-primary border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">Add Graph Node</h2>
            </div>
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Entity Type</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(NODE_LABELS).map(([type, lbl]) => (
                  <button key={type} type="button" onClick={() => setEntityType(type)}
                    className={cn('text-[10px] px-2 py-1 rounded-md border font-medium transition-all',
                      entityType === type ? 'border-current bg-current/10' : 'border-border bg-bg-secondary text-text-muted',
                    )} style={entityType === type ? { color: NODE_COLORS[type] } : undefined}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Label</label>
              <input type="text" value={label} onChange={e => setLabel(e.target.value)} autoFocus
                placeholder="e.g., 185.220.101.34 or APT28"
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 flex justify-between">
                <span>Risk Score</span>
                <span className="tabular-nums font-medium" style={{ color: riskScore >= 70 ? 'var(--sev-critical)' : riskScore >= 40 ? 'var(--sev-medium)' : 'var(--sev-low)' }}>{riskScore}</span>
              </label>
              <input type="range" min="0" max="100" value={riskScore} onChange={e => setRiskScore(parseInt(e.target.value))} className="w-full accent-accent" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-text-muted border border-border rounded-md">Cancel</button>
              <button type="submit" disabled={!label.trim() || createMutation.isPending}
                className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50">
                {createMutation.isPending ? 'Adding...' : 'Add Node'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
