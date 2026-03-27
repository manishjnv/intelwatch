/**
 * @module components/campaigns/CampaignPanel
 * @description Campaign detail panel — header, IOC breakdown by type,
 * relationships (actors, malware, CVEs, techniques), and event timeline.
 * Used in IOC detail views and standalone campaign browsing.
 */
import { cn } from '@/lib/utils'
import type { Campaign } from '@/hooks/use-campaigns'
import { Shield, Bug, Target } from 'lucide-react'

// ─── Status + Severity badges ───────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'text-sev-low bg-sev-low/10',
  suspected: 'text-sev-medium bg-sev-medium/10',
  historical: 'text-text-muted bg-bg-elevated',
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-sev-critical bg-sev-critical/10',
  high: 'text-sev-high bg-sev-high/10',
  medium: 'text-sev-medium bg-sev-medium/10',
  low: 'text-sev-low bg-sev-low/10',
  info: 'text-text-muted bg-bg-elevated',
}

const IOC_TYPE_ICONS: Record<string, string> = {
  ip: '🌐', domain: '🔗', hash_sha256: '#️⃣', hash_md5: '#️⃣',
  hash_sha1: '#️⃣', url: '🔗', email: '📧', cve: '🛡️',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Component ──────────────────────────────────────────────────

export interface CampaignPanelProps {
  campaign: Campaign
  onIocClick?: (iocId: string) => void
  onActorClick?: (name: string) => void
  onMalwareClick?: (name: string) => void
}

export function CampaignPanel({
  campaign,
  onActorClick,
  onMalwareClick,
}: CampaignPanelProps) {
  const typeEntries = Object.entries(campaign.iocTypes).sort(([, a], [, b]) => b - a)

  // Build timeline events from available data
  const timelineEvents: { date: string; label: string; color: string }[] = []
  if (campaign.firstSeen) {
    timelineEvents.push({ date: campaign.firstSeen, label: 'First IOC observed', color: 'bg-accent' })
  }
  if (campaign.actors.length > 0) {
    timelineEvents.push({ date: campaign.firstSeen ?? '', label: `Actor ${campaign.actors[0]} attributed`, color: 'bg-sev-high' })
  }
  if (campaign.malwareFamilies.length > 0) {
    timelineEvents.push({ date: campaign.firstSeen ?? '', label: `Malware ${campaign.malwareFamilies[0]} linked`, color: 'bg-sev-critical' })
  }
  if (campaign.lastSeen) {
    timelineEvents.push({ date: campaign.lastSeen, label: `Campaign at ${campaign.severity} severity`, color: 'bg-sev-medium' })
  }

  return (
    <div className="space-y-0" data-testid="campaign-panel">
      {/* Section 1: Header */}
      <div className="p-3 border-b border-border space-y-1.5" data-testid="campaign-header">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary leading-tight">{campaign.name}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', STATUS_COLORS[campaign.status] ?? STATUS_COLORS.historical)}
            data-testid="campaign-status-badge">
            {campaign.status}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted flex-wrap">
          <span>{formatDate(campaign.firstSeen)} → {formatDate(campaign.lastSeen)}</span>
          <span className={cn('px-1.5 py-0.5 rounded-full font-medium', SEV_COLORS[campaign.severity] ?? '')}>
            {campaign.severity}
          </span>
          <span className="tabular-nums">Conf: {campaign.confidence}%</span>
        </div>
      </div>

      {/* Section 2: IOC Breakdown by Type */}
      <div className="p-3 border-b border-border space-y-1.5" data-testid="campaign-iocs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">
            IOCs ({campaign.iocCount})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {typeEntries.map(([type, count]) => (
            <span key={type} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary"
              data-testid={`ioc-type-${type}`}>
              <span>{IOC_TYPE_ICONS[type] ?? '📌'}</span>
              <span className="font-mono uppercase">{type}</span>
              <span className="text-text-primary font-semibold">{count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Section 3: Relationships */}
      <div className="p-3 border-b border-border space-y-2" data-testid="campaign-relationships">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide block">Relationships</span>

        {campaign.actors.length > 0 && (
          <div className="flex items-start gap-2">
            <Target className="w-3 h-3 text-sev-critical shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {campaign.actors.map(a => (
                <button key={a} onClick={() => onActorClick?.(a)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-sev-critical/10 text-sev-critical hover:underline cursor-pointer"
                  data-testid="related-actor">
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {campaign.malwareFamilies.length > 0 && (
          <div className="flex items-start gap-2">
            <Bug className="w-3 h-3 text-sev-high shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {campaign.malwareFamilies.map(m => (
                <button key={m} onClick={() => onMalwareClick?.(m)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-sev-high/10 text-sev-high hover:underline cursor-pointer"
                  data-testid="related-malware">
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {campaign.techniques.length > 0 && (
          <div className="flex items-start gap-2">
            <Shield className="w-3 h-3 text-accent shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {campaign.techniques.map(t => (
                <a key={t} href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono hover:underline"
                  data-testid="related-technique">
                  {t}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Timeline */}
      {timelineEvents.length > 0 && (
        <div className="p-3 space-y-2" data-testid="campaign-timeline">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide block">Timeline</span>
          <div className="relative pl-4 space-y-2">
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
            {timelineEvents.map((evt, i) => (
              <div key={i} className="relative flex items-start gap-2">
                <div className={cn('absolute left-[-11px] top-1 w-2.5 h-2.5 rounded-full border-2 border-bg-primary', evt.color)} />
                <div className="min-w-0">
                  <span className="text-[10px] text-text-muted tabular-nums">{formatDate(evt.date)}</span>
                  <span className="text-[10px] text-text-secondary ml-2">{evt.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
