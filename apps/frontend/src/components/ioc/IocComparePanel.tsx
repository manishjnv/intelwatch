/**
 * @module components/ioc/IocComparePanel
 * @description Side-by-side comparison of 2-3 IOCs with diff highlighting.
 * No competitor offers inline IOC comparison. Full-screen modal overlay.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, GitCompare } from 'lucide-react'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { ConfidenceGauge } from '@/components/ioc/ConfidenceGauge'
import type { IOCRecord } from '@/hooks/use-intel-data'

interface IocComparePanelProps {
  records: IOCRecord[]
  onClose: () => void
}

/** Check if all values in a row are identical */
function allSame(values: unknown[]): boolean {
  const first = JSON.stringify(values[0])
  return values.every(v => JSON.stringify(v) === first)
}

interface CompareRow {
  label: string
  values: React.ReactNode[]
  same: boolean
}

export function IocComparePanel({ records, onClose }: IocComparePanelProps) {
  const rows = useMemo(() => buildRows(records), [records])

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="ioc-compare-panel"
    >
      <motion.div
        className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 25 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <GitCompare className="w-4 h-4 text-accent" />
            Compare IOCs ({records.length})
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted" data-testid="close-compare">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* IOC headers */}
        <div className={`grid border-b border-border ${gridCols(records.length)}`}>
          <div className="px-3 py-2 text-[10px] text-text-muted uppercase tracking-wider border-r border-border">Field</div>
          {records.map((r, i) => (
            <div key={r.id} className={`px-3 py-2 text-xs font-mono text-text-primary truncate ${i < records.length - 1 ? 'border-r border-border' : ''}`} title={r.normalizedValue}>
              {r.normalizedValue}
            </div>
          ))}
        </div>

        {/* Comparison rows */}
        <div className="flex-1 overflow-y-auto">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className={`grid ${gridCols(records.length)} ${row.same ? 'bg-sev-low/[0.03]' : 'bg-sev-critical/[0.03]'} ${idx % 2 === 0 ? '' : 'bg-bg-elevated/20'}`}
              data-testid="compare-row"
            >
              <div className="px-3 py-2 text-[10px] text-text-muted uppercase tracking-wider border-r border-border flex items-center">
                {!row.same && <span className="w-1.5 h-1.5 rounded-full bg-sev-critical mr-1.5 shrink-0" />}
                {row.label}
              </div>
              {row.values.map((val, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 text-xs text-text-primary flex items-center ${i < records.length - 1 ? 'border-r border-border' : ''} ${!row.same ? 'border-l-2 border-l-sev-critical/20' : ''}`}
                >
                  {val ?? <span className="text-text-muted">—</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function gridCols(n: number): string {
  return n === 2 ? 'grid-cols-[120px_1fr_1fr]' : 'grid-cols-[120px_1fr_1fr_1fr]'
}

function buildRows(records: IOCRecord[]): CompareRow[] {
  const rows: CompareRow[] = []

  const add = (label: string, extract: (r: IOCRecord) => React.ReactNode, rawExtract?: (r: IOCRecord) => unknown) => {
    const raw = rawExtract ?? ((r) => extract(r))
    rows.push({ label, values: records.map(extract), same: allSame(records.map(raw)) })
  }

  add('Type', r => <span className="font-mono uppercase">{r.iocType}</span>, r => r.iocType)
  add('Severity', r => <SeverityBadge severity={r.severity} />, r => r.severity)
  add('Confidence', r => <ConfidenceGauge value={r.confidence} />, r => r.confidence)
  add('Lifecycle', r => <LifecyclePill state={r.lifecycle} />, r => r.lifecycle)
  add('TLP', r => <span className="uppercase font-mono text-[10px]">{r.tlp}</span>, r => r.tlp)
  add('First Seen', r => r.firstSeen ? new Date(r.firstSeen).toLocaleDateString() : '—', r => r.firstSeen?.slice(0, 10))
  add('Last Seen', r => r.lastSeen ? new Date(r.lastSeen).toLocaleDateString() : '—', r => r.lastSeen?.slice(0, 10))
  add('Corroboration', r => <span>{r.corroborationCount ?? 0} feeds</span>, r => r.corroborationCount)
  add('Tags', r => <TagList tags={r.tags} />, r => r.tags?.sort().join(','))
  add('Threat Actors', r => <TagList tags={r.threatActors} />, r => r.threatActors?.sort().join(','))
  add('Malware', r => <TagList tags={r.malwareFamilies} />, r => r.malwareFamilies?.sort().join(','))
  add('Campaign', r => r.campaignId ? <span className="font-mono text-[10px]">{r.campaignId}</span> : null, r => r.campaignId)

  return rows
}

function LifecyclePill({ state }: { state: string }) {
  const colors: Record<string, string> = {
    new: 'bg-blue-500/15 text-blue-300', active: 'bg-green-500/15 text-green-300',
    aging: 'bg-yellow-500/15 text-yellow-300', expired: 'bg-slate-500/15 text-slate-300',
  }
  return <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors[state] ?? 'bg-bg-elevated text-text-muted'}`}>{state}</span>
}

function TagList({ tags }: { tags?: string[] }) {
  if (!tags?.length) return <span className="text-text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 4).map(t => (
        <span key={t} className="px-1 py-0.5 bg-bg-elevated rounded text-[10px] text-text-secondary border border-border">{t}</span>
      ))}
      {tags.length > 4 && <span className="text-[10px] text-text-muted">+{tags.length - 4}</span>}
    </div>
  )
}
