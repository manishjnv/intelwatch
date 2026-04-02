/**
 * @module components/ioc/ioc-columns
 * @description Column definitions for the IOC DataTable — extracted from IocListPage.
 * Density-adaptive rendering for all 12 columns.
 */
import { cn } from '@/lib/utils'
import type { Column, Density } from '@/components/data/DataTable'
import type { IOCRecord } from '@/hooks/use-intel-data'
import type { Campaign } from '@/hooks/use-campaigns'
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { EntityPreview } from '@/components/viz/EntityPreview'
import { ConfidenceGauge } from './ConfidenceGauge'
import { toChipType, timeAgo } from './ioc-utils'
import { CheckCircle2, Clock, CircleDot } from 'lucide-react'

interface ColumnDeps {
  campaignMap: Map<string, Campaign>
  expandedCampaignId: string | null
  onCampaignClick: (id: string) => void
}

/** Build IOC column definitions with external dependencies injected. */
export function getIocColumns(deps: ColumnDeps): Column<IOCRecord>[] {
  const { campaignMap, expandedCampaignId, onCampaignClick } = deps

  return [
    {
      key: 'normalizedValue', label: 'Value', sortable: true, width: '24%',
      render: (row: IOCRecord) => (
        <EntityPreview type={row.iocType} value={row.normalizedValue} severity={row.severity}
          confidence={row.confidence} firstSeen={row.firstSeen} lastSeen={row.lastSeen} tags={row.tags}>
          <EntityChip type={toChipType(row.iocType) as any} value={row.normalizedValue} />
        </EntityPreview>
      ),
    },
    {
      key: 'corroborationCount', label: 'Corrob.', sortable: true, width: '5%',
      render: (row: IOCRecord) => {
        const count = row.corroborationCount ?? 0
        if (count <= 1) return null
        return (
          <span data-testid="corroboration-badge"
            title={`Seen by ${count} feeds`}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums',
              count >= 3 ? 'bg-accent/10 text-accent' : 'bg-bg-elevated text-text-muted',
            )}>
            &times;{count}
          </span>
        )
      },
    },
    {
      key: 'iocType', label: 'Type', sortable: true, width: '7%',
      render: (row: IOCRecord) => (
        <span className="text-text-muted uppercase text-[10px] font-mono">{row.iocType}</span>
      ),
    },
    {
      key: 'severity', label: 'Severity', sortable: true, width: '9%',
      render: (row: IOCRecord, d: Density) => (
        <SeverityBadge severity={row.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'} showDot={d !== 'ultra-dense'} />
      ),
    },
    {
      key: 'confidence', label: 'Conf', sortable: true, width: '7%',
      render: (row: IOCRecord, d: Density) => d === 'ultra-dense'
        ? <span className="tabular-nums">{row.confidence}</span>
        : <ConfidenceGauge value={row.confidence} />,
    },
    {
      key: 'source', label: 'Source', width: '6%',
      render: (row: IOCRecord) => {
        const src = (row as any).source === 'global' ? 'global' : 'private'
        return (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            src === 'global' ? 'bg-blue-400/10 text-blue-400' : 'bg-text-muted/10 text-text-muted',
          )}>
            {src === 'global' ? 'Global' : 'Private'}
          </span>
        )
      },
    },
    {
      key: 'lifecycle', label: 'Lifecycle', sortable: true, width: '7%',
      render: (row: IOCRecord) => {
        const colors: Record<string, string> = {
          new: 'text-accent bg-accent/10', active: 'text-sev-low bg-sev-low/10',
          aging: 'text-sev-medium bg-sev-medium/10', expired: 'text-text-muted bg-bg-elevated',
        }
        return (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[row.lifecycle] ?? 'text-text-muted'}`}>
            {row.lifecycle}
          </span>
        )
      },
    },
    {
      key: 'tlp', label: 'TLP', width: '5%',
      render: (row: IOCRecord) => {
        const colors: Record<string, string> = { red: 'text-sev-critical', amber: 'text-sev-medium', green: 'text-sev-low', white: 'text-text-muted' }
        return <span className={`text-[10px] uppercase font-medium ${colors[row.tlp] ?? ''}`}>{row.tlp}</span>
      },
    },
    {
      key: 'tags', label: 'Tags', width: '10%',
      render: (row: IOCRecord, d: Density) => {
        if (d === 'ultra-dense') return <span className="text-text-muted">{row.tags.length || '—'}</span>
        return (
          <div className="flex flex-wrap gap-0.5 max-w-[200px]">
            {row.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[10px] px-1 py-0.5 rounded bg-bg-elevated text-text-secondary truncate max-w-[80px]">{t}</span>
            ))}
            {row.tags.length > 3 && <span className="text-[10px] text-text-muted">+{row.tags.length - 3}</span>}
          </div>
        )
      },
    },
    {
      key: 'enrichmentStatus', label: 'Enriched', width: '5%',
      render: (row: IOCRecord) => {
        const hasAi = row.aiConfidence != null && row.aiConfidence > 0
        const hasFeed = row.feedReliability != null && row.feedReliability > 0
        if (hasAi) return (
          <span className="inline-flex items-center gap-1 text-[10px] text-sev-low" title="AI enrichment complete — click row for details">
            <CheckCircle2 className="w-3 h-3" />Enriched
          </span>
        )
        if (hasFeed) return (
          <span className="inline-flex items-center gap-1 text-[10px] text-sev-medium" title="Feed data available — AI enrichment pending">
            <CircleDot className="w-3 h-3" />Partial
          </span>
        )
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-text-muted" title="Awaiting enrichment">
            <Clock className="w-3 h-3" />Pending
          </span>
        )
      },
    },
    {
      key: 'lastSeen', label: 'Last Seen', sortable: true, width: '9%',
      render: (row: IOCRecord) => <span className="text-text-muted tabular-nums">{timeAgo(row.lastSeen)}</span>,
    },
    {
      key: 'campaignId', label: 'Campaign', width: '6%',
      render: (row: IOCRecord) => {
        if (!row.campaignId) return null
        const camp = campaignMap.get(row.campaignId)
        const label = camp?.name ?? row.campaignId
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onCampaignClick(row.campaignId === expandedCampaignId ? '' : row.campaignId!) }}
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-400/10 text-purple-400 font-medium truncate max-w-[80px] block hover:bg-purple-400/20 transition-colors"
            title={label} data-testid="campaign-badge">
            {label.length > 12 ? label.slice(0, 12) + '…' : label}
          </button>
        )
      },
    },
  ]
}
