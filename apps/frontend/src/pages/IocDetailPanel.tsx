/**
 * @module pages/IocDetailPanel
 * @description Split-pane detail panel for IOC list — enrichment, details, relations, pivot, timeline tabs.
 * Extracted from IocListPage to keep both files under 400 lines.
 */
import { useState, useMemo, lazy, Suspense } from 'react'
import { Brain, GitBranch, FileText, Compass, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { EnrichmentDetailPanel } from '@/components/viz/EnrichmentDetailPanel'
import { IOCDetailBack } from '@/components/viz/FlipDetailCard'
import { ConfidenceBreakdown } from '@/components/viz/ConfidenceBreakdown'
import { useIOCPivot, useIOCTimeline, useUpdateIOCLifecycle, type IOCRecord, type IOCPivotResult, type IOCTimelineEvent } from '@/hooks/use-intel-data'
import { useIOCEnrichment } from '@/hooks/use-enrichment-data'
import { useNodeNeighbors } from '@/hooks/use-phase4-data'
import type { GraphNode as RGNode, GraphEdge as RGEdge } from '@/components/viz/RelationshipGraph'

const LazyRelationshipGraph = lazy(() =>
  import('@/components/viz/RelationshipGraph').then(m => ({ default: m.RelationshipGraph }))
)

/** G3b: Valid lifecycle transitions from a given state */
const LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  new:            ['active', 'false_positive', 'watchlisted'],
  active:         ['aging', 'revoked', 'false_positive', 'watchlisted'],
  aging:          ['expired', 'active', 'revoked', 'false_positive'],
  expired:        ['active', 'revoked'],
  revoked:        [],
  false_positive: [],
  watchlisted:    ['active', 'revoked'],
}

function generateStubRelations(record: { id: string; normalizedValue: string; iocType: string; threatActors: string[]; malwareFamilies: string[] }): { nodes: RGNode[]; edges: RGEdge[] } {
  const nodes: RGNode[] = [
    { id: record.id, type: record.iocType, label: record.normalizedValue, primary: true },
  ]
  const edges: RGEdge[] = []
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

type DetailTab = 'enrichment' | 'details' | 'relations' | 'pivot' | 'timeline'

interface IocDetailPanelProps {
  record: IOCRecord
  isDemo: boolean
}

export function IocDetailPanel({ record, isDemo }: IocDetailPanelProps) {
  const [detailTab, setDetailTab] = useState<DetailTab>('enrichment')

  const { data: pivotData, isLoading: pivotLoading } = useIOCPivot(record.id)
  const { data: timelineData, isLoading: timelineLoading } = useIOCTimeline(record.id)
  const { data: enrichmentData } = useIOCEnrichment(record.id)
  const { data: graphData, isLoading: graphLoading } = useNodeNeighbors(record.id)
  const updateLifecycleMutation = useUpdateIOCLifecycle()

  const relationData = useMemo(() => {
    const gNodes = graphData?.nodes ?? []
    const gEdges = graphData?.edges ?? []
    if (gNodes.length > 0) {
      return {
        nodes: gNodes.map(n => ({
          id: n.id,
          type: n.entityType ?? 'unknown',
          label: n.label,
          primary: n.id === record.id,
        })),
        edges: gEdges.map(e => ({
          source: e.sourceId,
          target: e.targetId,
          label: e.relationshipType,
        })),
      }
    }
    return isDemo ? generateStubRelations(record) : null
  }, [record, graphData, isDemo])

  return (
    <div className="h-full flex flex-col">
      {/* Compact IOC header */}
      <div className="shrink-0 p-3 border-b border-border space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary truncate max-w-[70%]">{record.normalizedValue}</span>
          <SeverityBadge severity={record.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'} />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted flex-wrap">
          <span className="uppercase font-mono">{record.iocType}</span>
          <span>Conf: <span className="text-text-primary tabular-nums">{record.confidence}%</span></span>
          <span className="uppercase">{record.tlp}</span>
          <span className="capitalize font-medium text-text-primary">{record.lifecycle}</span>
          {(LIFECYCLE_TRANSITIONS[record.lifecycle] ?? []).length > 0 && !isDemo && (
            <div className="flex items-center gap-1 ml-1">
              {(LIFECYCLE_TRANSITIONS[record.lifecycle] ?? []).map(nextState => (
                <button
                  key={nextState}
                  title={`Mark as ${nextState}`}
                  disabled={updateLifecycleMutation.isPending}
                  onClick={() => updateLifecycleMutation.mutate({ iocId: record.id, state: nextState })}
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded border font-medium transition-colors disabled:opacity-50',
                    nextState === 'false_positive' || nextState === 'revoked'
                      ? 'border-sev-critical/40 text-sev-critical hover:bg-sev-critical/10'
                      : nextState === 'watchlisted'
                      ? 'border-purple-400/40 text-purple-400 hover:bg-purple-400/10'
                      : 'border-border text-text-muted hover:text-text-primary hover:border-accent',
                  )}>
                  {nextState.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 py-2">
        <ConfidenceBreakdown record={record} isDemo={isDemo} />
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-border">
        {([
          { key: 'enrichment' as const, label: 'Enrichment', icon: Brain },
          { key: 'details' as const, label: 'Details', icon: FileText },
          { key: 'relations' as const, label: 'Relations', icon: GitBranch },
          { key: 'pivot' as const, label: 'Pivot', icon: Compass },
          { key: 'timeline' as const, label: 'Timeline', icon: Clock },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setDetailTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
              detailTab === key
                ? 'text-accent border-b-2 border-accent bg-accent/5'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {detailTab === 'enrichment' && (
          <EnrichmentDetailPanel
            iocId={record.id}
            iocType={record.iocType}
            enrichment={enrichmentData ?? null}
            className="p-3"
          />
        )}
        {detailTab === 'details' && (
          <IOCDetailBack
            record={record}
            onFlipBack={() => setDetailTab('enrichment')}
          />
        )}
        {detailTab === 'relations' && (
          <div className="p-2">
            {graphLoading && (
              <div className="rounded-lg border border-border bg-bg-secondary/30 animate-pulse" style={{ width: 280, height: 200 }} />
            )}
            {!graphLoading && relationData && relationData.nodes.length > 0 && (
              <Suspense fallback={<div className="rounded-lg border border-border bg-bg-secondary/30" style={{ width: 280, height: 200 }} />}>
                <LazyRelationshipGraph nodes={relationData.nodes} edges={relationData.edges} />
              </Suspense>
            )}
            {!graphLoading && (!relationData || relationData.nodes.length === 0) && (
              <div className="text-center py-6 text-text-muted" data-testid="relations-empty">
                <GitBranch className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                <p className="text-xs">No relationships discovered yet</p>
                <p className="text-[10px] mt-0.5">Relationships appear as this IOC is correlated and graphed</p>
              </div>
            )}
          </div>
        )}

        {detailTab === 'pivot' && (
          <div className="p-3 space-y-3" data-testid="ioc-pivot-tab">
            {pivotLoading && (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-4 bg-bg-elevated rounded animate-pulse" />)}</div>
            )}
            {!pivotLoading && pivotData && (
              <>
                {(pivotData as IOCPivotResult).relatedIOCs?.length > 0 && (
                  <div>
                    <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Related IOCs ({(pivotData as IOCPivotResult).relatedIOCs.length})</h4>
                    <div className="space-y-1">
                      {(pivotData as IOCPivotResult).relatedIOCs.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-[11px] px-2 py-1 bg-bg-secondary rounded border border-border">
                          <span className="text-text-primary font-mono truncate max-w-[60%]">{r.normalizedValue}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-text-muted uppercase">{r.iocType}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent">{r.relationship}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(pivotData as IOCPivotResult).actors?.length > 0 && (
                  <div>
                    <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Threat Actors</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(pivotData as IOCPivotResult).actors.map(a => (
                        <span key={a.id} className="text-[10px] px-2 py-1 rounded bg-sev-critical/10 text-sev-critical border border-sev-critical/20">
                          {a.name} <span className="text-text-muted">({a.confidence}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(pivotData as IOCPivotResult).malware?.length > 0 && (
                  <div>
                    <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Malware Families</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(pivotData as IOCPivotResult).malware.map(m => (
                        <span key={m.id} className="text-[10px] px-2 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                          {m.name} <span className="text-text-muted">({m.confidence}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(pivotData as IOCPivotResult).campaigns?.length > 0 && (
                  <div>
                    <h4 className="text-[10px] text-text-muted uppercase mb-1.5">Campaigns</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(pivotData as IOCPivotResult).campaigns.map(c => (
                        <span key={c.id} className="text-[10px] px-2 py-1 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">{c.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {!(pivotData as IOCPivotResult).relatedIOCs?.length && !(pivotData as IOCPivotResult).actors?.length && !(pivotData as IOCPivotResult).malware?.length && (
                  <div className="text-center py-6 text-text-muted">
                    <Compass className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                    <p className="text-xs">No pivot data available yet</p>
                    <p className="text-[10px] mt-0.5">Enrich this IOC to discover related entities</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {detailTab === 'timeline' && (
          <div className="p-3" data-testid="ioc-timeline-tab">
            {timelineLoading && (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-4 bg-bg-elevated rounded animate-pulse" />)}</div>
            )}
            {!timelineLoading && (timelineData as IOCTimelineEvent[] | undefined)?.length ? (
              <div className="space-y-2 relative before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-border">
                {(timelineData as IOCTimelineEvent[]).map((evt, i) => {
                  const typeColors: Record<string, string> = {
                    first_seen: 'bg-accent', enrichment: 'bg-sev-low', sighting: 'bg-sev-medium',
                    severity_change: 'bg-sev-critical', correlation: 'bg-purple-400', triage: 'bg-amber-400',
                  }
                  return (
                    <div key={i} className="flex items-start gap-3 pl-4 relative">
                      <div className={cn('absolute left-0.5 top-1 w-2 h-2 rounded-full border border-bg-primary', typeColors[evt.eventType] ?? 'bg-text-muted')} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] tabular-nums text-text-muted">{new Date(evt.timestamp).toLocaleString()}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated text-text-muted uppercase">{evt.eventType.replace('_', ' ')}</span>
                        </div>
                        <div className="text-[11px] text-text-primary mt-0.5">{evt.summary}</div>
                        {evt.source && <div className="text-[10px] text-text-muted">via {evt.source}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : !timelineLoading ? (
              <div className="text-center py-6 text-text-muted">
                <Clock className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                <p className="text-xs">No timeline events yet</p>
                <p className="text-[10px] mt-0.5">Events appear as this IOC is enriched and observed</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
