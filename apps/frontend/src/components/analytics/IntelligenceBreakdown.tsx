/**
 * @module components/analytics/IntelligenceBreakdown
 * @description Distribution panels — IOC type donut, confidence histogram,
 * lifecycle breakdown, top corroborated IOCs, top CVEs, enrichment coverage.
 */
import { cn } from '@/lib/utils'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import type { AnalyticsDashboardData, TopIoc, TopCve } from '@/hooks/use-analytics-dashboard'

// ─── Colors ─────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  ip: '#3b82f6', domain: '#8b5cf6', hash: '#06b6d4', url: '#10b981', cve: '#f97316', email: '#ec4899',
}
const CONF_COLORS: Record<string, string> = {
  none: '#ef4444', low: '#f97316', 'low-medium': '#eab308', medium: '#84cc16', 'high-low': '#22c55e', high: '#10b981',
}
const LIFECYCLE_COLORS: Record<string, string> = {
  new: '#3b82f6', active: '#10b981', stale: '#eab308', expired: '#6b7280',
  false_positive: '#ef4444', blocked: '#8b5cf6', allowlisted: '#06b6d4',
}
const SEV_COLORS: Record<string, string> = {
  critical: 'text-sev-critical', high: 'text-sev-high', medium: 'text-sev-medium', low: 'text-sev-low',
}

// ─── Panel Wrapper ──────────────────────────────────────────────

function Panel({ title, help, children, testId }: {
  title: string; help?: string; children: React.ReactNode; testId: string
}) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border" data-testid={testId}>
      <div className="flex items-center gap-1.5 mb-3">
        <h4 className="text-xs font-semibold text-text-primary">{title}</h4>
        {help && <TooltipHelp message={help} />}
      </div>
      {children}
    </div>
  )
}

// ─── Donut Chart (IOC Type) ─────────────────────────────────────

function DonutChart({ data, onSegmentClick }: {
  data: Record<string, number>; onSegmentClick?: (type: string) => void
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1
  const size = 120; const cx = size / 2; const cy = size / 2
  const r = 42; const innerR = 28

  let cumAngle = -Math.PI / 2
  const segments = entries.map(([type, count]) => {
    const angle = (count / total) * 2 * Math.PI
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle
    const largeArc = angle > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(startAngle); const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle); const y2 = cy + r * Math.sin(endAngle)
    const ix1 = cx + innerR * Math.cos(endAngle); const iy1 = cy + innerR * Math.sin(endAngle)
    const ix2 = cx + innerR * Math.cos(startAngle); const iy2 = cy + innerR * Math.sin(startAngle)
    const d = `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc} 0 ${ix2},${iy2} Z`
    return { type, count, d, color: TYPE_COLORS[type] ?? '#6b7280' }
  })

  return (
    <div className="flex items-center gap-3" data-testid="donut-chart">
      <svg width={size} height={size} className="shrink-0">
        {segments.map(s => (
          <path key={s.type} d={s.d} fill={s.color} className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onSegmentClick?.(s.type)}>
            <title>{s.type}: {s.count}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-text-primary" style={{ fontSize: '14px', fontWeight: 700 }}>
          {total.toLocaleString()}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-text-muted" style={{ fontSize: '6px' }}>
          total
        </text>
      </svg>
      <div className="space-y-1">
        {segments.map(s => (
          <div key={s.type} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
            onClick={() => onSegmentClick?.(s.type)}>
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-text-primary capitalize">{s.type}</span>
            <span className="text-[10px] text-text-muted tabular-nums">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Confidence Histogram ───────────────────────────────────────

function ConfidenceHistogram({ data }: { data: Record<string, number> }) {
  const tiers = ['none', 'low', 'low-medium', 'medium', 'high-low', 'high']
  const max = Math.max(...tiers.map(t => data[t] ?? 0)) || 1

  return (
    <div className="space-y-1.5" data-testid="confidence-histogram">
      {tiers.map(tier => {
        const count = data[tier] ?? 0
        const pct = (count / max) * 100
        return (
          <div key={tier} className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-20 text-right capitalize">{tier.replace('-', ' ')}</span>
            <div className="flex-1 h-3 bg-bg-elevated rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: CONF_COLORS[tier] ?? '#6b7280' }}
                data-testid={`conf-bar-${tier}`} />
            </div>
            <span className="text-[10px] text-text-muted tabular-nums w-10">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Lifecycle Bar ──────────────────────────────────────────────

function LifecycleBar({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1
  const entries = Object.entries(data).filter(([, v]) => v > 0)

  return (
    <div className="space-y-2" data-testid="lifecycle-bar">
      <div className="flex h-4 rounded-full overflow-hidden">
        {entries.map(([state, count]) => (
          <div key={state} className="transition-all duration-500"
            style={{ width: `${(count / total) * 100}%`, backgroundColor: LIFECYCLE_COLORS[state] ?? '#6b7280' }}
            title={`${state}: ${count}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.map(([state, count]) => (
          <div key={state} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: LIFECYCLE_COLORS[state] ?? '#6b7280' }} />
            <span className="text-[10px] text-text-muted capitalize">{state.replace('_', ' ')}</span>
            <span className="text-[10px] text-text-muted tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Top IOCs Table ─────────────────────────────────────────────

function TopIocsTable({ items, onRowClick }: { items: TopIoc[]; onRowClick?: (ioc: TopIoc) => void }) {
  if (items.length === 0) return <div className="text-[10px] text-text-muted text-center py-4">No IOC data</div>
  return (
    <div className="overflow-x-auto" data-testid="top-iocs-table">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left py-1 font-medium">IOC</th>
            <th className="text-left py-1 font-medium">Type</th>
            <th className="text-right py-1 font-medium">Conf</th>
            <th className="text-left py-1 font-medium">Sev</th>
            <th className="text-right py-1 font-medium">Corr</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ioc, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-bg-hover cursor-pointer transition-colors"
              onClick={() => onRowClick?.(ioc)}>
              <td className="py-1.5 text-text-primary font-mono truncate max-w-[160px]">{ioc.value}</td>
              <td className="py-1.5 capitalize" style={{ color: TYPE_COLORS[ioc.type] ?? '#6b7280' }}>{ioc.type}</td>
              <td className="py-1.5 text-right tabular-nums text-text-primary">{ioc.confidence}</td>
              <td className="py-1.5"><span className={cn('capitalize', SEV_COLORS[ioc.severity])}>{ioc.severity}</span></td>
              <td className="py-1.5 text-right tabular-nums text-text-muted">{ioc.corroboration ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Top CVEs Table ─────────────────────────────────────────────

function TopCvesTable({ items }: { items: TopCve[] }) {
  if (items.length === 0) return <div className="text-[10px] text-text-muted text-center py-4">No CVE data</div>
  return (
    <div className="overflow-x-auto" data-testid="top-cves-table">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left py-1 font-medium">CVE ID</th>
            <th className="text-right py-1 font-medium">EPSS</th>
            <th className="text-left py-1 font-medium">Severity</th>
            <th className="text-right py-1 font-medium">Products</th>
          </tr>
        </thead>
        <tbody>
          {items.map(cve => {
            const epssPct = (cve.epss * 100).toFixed(1)
            const epssColor = cve.epss > 0.5 ? 'text-sev-critical' : cve.epss > 0.1 ? 'text-sev-medium' : 'text-sev-low'
            return (
              <tr key={cve.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                <td className="py-1.5 text-text-primary font-mono">{cve.id}</td>
                <td className={cn('py-1.5 text-right tabular-nums font-medium', epssColor)}
                  data-testid={`epss-${cve.id}`}>
                  {epssPct}%
                </td>
                <td className="py-1.5"><span className={cn('capitalize', SEV_COLORS[cve.severity])}>{cve.severity}</span></td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">{cve.affectedProducts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Enrichment Coverage Matrix ─────────────────────────────────

function EnrichmentMatrix({ stats }: { stats: AnalyticsDashboardData['enrichmentStats'] }) {
  const sources = Object.keys(stats.bySource)
  if (sources.length === 0) return <div className="text-[10px] text-text-muted text-center py-4">No enrichment data</div>

  return (
    <div className="overflow-x-auto" data-testid="enrichment-matrix">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left py-1 font-medium">Source</th>
            <th className="text-right py-1 font-medium">Success</th>
            <th className="text-right py-1 font-medium">Failed</th>
            <th className="text-right py-1 font-medium">Rate</th>
          </tr>
        </thead>
        <tbody>
          {sources.map(src => {
            const s = stats.bySource[src]
            const total = s.success + s.failed
            const rate = total > 0 ? Math.round((s.success / total) * 100) : 0
            const rateColor = rate > 80 ? 'text-sev-low' : rate > 50 ? 'text-sev-medium' : 'text-sev-critical'
            return (
              <tr key={src} className="border-b border-border/50">
                <td className="py-1.5 text-text-primary">{src}</td>
                <td className="py-1.5 text-right tabular-nums text-sev-low">{s.success}</td>
                <td className="py-1.5 text-right tabular-nums text-sev-critical">{s.failed}</td>
                <td className={cn('py-1.5 text-right tabular-nums font-medium', rateColor)}
                  data-testid={`enrich-rate-${src}`}>
                  {rate}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

interface IntelligenceBreakdownProps {
  data: AnalyticsDashboardData
  onIocClick?: (ioc: TopIoc) => void
  onTypeFilter?: (type: string) => void
}

export function IntelligenceBreakdown({ data, onIocClick, onTypeFilter }: IntelligenceBreakdownProps) {
  return (
    <section data-testid="intelligence-breakdown" className="space-y-3">
      <h3 className="text-xs font-semibold text-text-primary">Intelligence Breakdown</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <Panel title="IOC Type Distribution" help="Click a segment to filter" testId="panel-ioc-type">
          <DonutChart data={data.iocByType} onSegmentClick={onTypeFilter} />
        </Panel>

        <Panel title="Confidence Distribution" help="STIX confidence tiers" testId="panel-confidence">
          <ConfidenceHistogram data={data.iocByConfidenceTier} />
        </Panel>

        <Panel title="Lifecycle Breakdown" help="IOC progression through lifecycle states" testId="panel-lifecycle">
          <LifecycleBar data={data.iocByLifecycle} />
        </Panel>

        <Panel title="Top Corroborated IOCs" help="Highest corroboration scores" testId="panel-top-iocs">
          <TopIocsTable items={data.topIocs} onRowClick={onIocClick} />
        </Panel>

        <Panel title="Top CVEs by EPSS" help="Highest exploitation probability" testId="panel-top-cves">
          <TopCvesTable items={data.topCves} />
        </Panel>

        <Panel title="Enrichment Source Coverage" help="Success rate by enrichment source" testId="panel-enrichment">
          <EnrichmentMatrix stats={data.enrichmentStats} />
        </Panel>
      </div>
    </section>
  )
}
