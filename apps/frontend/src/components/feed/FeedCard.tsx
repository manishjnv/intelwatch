/**
 * @module components/feed/FeedCard
 * @description Feed card for card-view mode, plus shared feed sub-components:
 * FeedTypeIcon, StatusDot, ReliabilityBar, formatTime, getNextFireLabel.
 * Exported here so FeedListPage can import them without circular dependencies.
 */
import { Globe, Rss, Server, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedRecord } from '@/hooks/use-intel-data'

// ─── Feed type icon ───────────────────────────────────────────

export function FeedTypeIcon({ type }: { type: string }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0'
  if (type === 'rss')        return <Rss    className={cn(cls, 'text-orange-400')} />
  if (type === 'rest_api')   return <Globe  className={cn(cls, 'text-blue-400')} />
  if (type === 'csv_upload') return <Upload className={cn(cls, 'text-text-muted')} />
  return <Server className={cn(cls, 'text-purple-400')} />
}

// ─── Animated status dot ──────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; pulse: boolean; label: string; text: string }> = {
  active:   { dot: 'bg-sev-low',       pulse: true,  label: 'Active',   text: 'text-sev-low' },
  error:    { dot: 'bg-sev-critical',  pulse: false, label: 'Error',    text: 'text-sev-critical' },
  disabled: { dot: 'bg-text-muted/40', pulse: false, label: 'Disabled', text: 'text-text-muted' },
  paused:   { dot: 'bg-sev-medium',    pulse: false, label: 'Paused',   text: 'text-sev-medium' },
}

export function StatusDot({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG['disabled']!
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {c.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot}`} />
      </span>
      <span className={`text-[10px] font-medium ${c.text}`}>{c.label}</span>
    </span>
  )
}

// ─── Radial reliability gauge ─────────────────────────────────
// SVG 40×40, arc from 330° to 210° (CW through bottom) = 240° sweep.
// Gap sits at the top (210°–330°). Fill grows clockwise from 330°.

export function ReliabilityBar({ value }: { value: number }) {
  const cx = 20, cy = 20, r = 14

  function toPoint(deg: number): [number, number] {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }

  const [sx, sy] = toPoint(330)
  const [ex, ey] = toPoint(210)
  // Background track: 240° CW from 330° to 210° → large-arc=1, sweep=1
  const trackD = `M ${sx.toFixed(2)},${sy.toFixed(2)} A ${r},${r} 0 1,1 ${ex.toFixed(2)},${ey.toFixed(2)}`

  // Fill arc: grow CW from 330° by (value/100 × 240°)
  const sweep = (value / 100) * 240
  const [fx, fy] = toPoint(330 + sweep)
  const largArc = sweep >= 180 ? 1 : 0
  const fillD = sweep < 1
    ? ''
    : `M ${sx.toFixed(2)},${sy.toFixed(2)} A ${r},${r} 0 ${largArc},1 ${fx.toFixed(2)},${fy.toFixed(2)}`

  const arcClass = value >= 70 ? 'stroke-sev-low' : value >= 40 ? 'stroke-sev-medium' : 'stroke-sev-critical'

  return (
    <div title={`Reliability: ${value}%`} data-testid="reliability-gauge">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <path d={trackD} fill="none" className="stroke-bg-elevated" strokeWidth="3" strokeLinecap="round" />
        {fillD && (
          <path d={fillD} fill="none" className={arcClass} strokeWidth="3" strokeLinecap="round" />
        )}
        <text x="20" y="23" textAnchor="middle" fontSize="9" className="fill-text-muted">
          {value}%
        </text>
      </svg>
    </div>
  )
}

// ─── Health score (0-100) ─────────────────────────────────────
// Weights: consecutiveFailures 40%, feedReliability 30%, time since last success 30%

export function computeFeedHealth(feed: {
  consecutiveFailures: number;
  feedReliability: number;
  lastFetchAt: string | null;
  status: string;
}): number {
  // Failure score: 0 failures = 100, 1 = 80, 2 = 50, 3+ = 0
  const failScore = feed.consecutiveFailures === 0 ? 100
    : feed.consecutiveFailures === 1 ? 80
    : feed.consecutiveFailures === 2 ? 50
    : 0;

  // Reliability score: already 0-100
  const reliabilityScore = Math.max(0, Math.min(100, feed.feedReliability));

  // Recency score: <1h = 100, 1-6h = 80, 6-24h = 50, >24h = 20, never = 0
  let recencyScore = 0;
  if (feed.lastFetchAt) {
    const hoursAgo = (Date.now() - new Date(feed.lastFetchAt).getTime()) / 3_600_000;
    recencyScore = hoursAgo < 1 ? 100 : hoursAgo < 6 ? 80 : hoursAgo < 24 ? 50 : 20;
  }

  return Math.round(failScore * 0.4 + reliabilityScore * 0.3 + recencyScore * 0.3);
}

export type HealthLevel = 'green' | 'amber' | 'red';

export function healthLevel(score: number): HealthLevel {
  if (score > 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

const HEALTH_COLORS: Record<HealthLevel, { dot: string; text: string }> = {
  green: { dot: 'bg-sev-low',      text: 'text-sev-low' },
  amber: { dot: 'bg-sev-medium',   text: 'text-sev-medium' },
  red:   { dot: 'bg-sev-critical', text: 'text-sev-critical' },
};

export function HealthDot({ score }: { score: number }) {
  const level = healthLevel(score);
  const c = HEALTH_COLORS[level];
  return (
    <span className="inline-flex items-center gap-1" title={`Health: ${score}/100`} data-testid="health-dot">
      <span className={cn('inline-block w-2 h-2 rounded-full', c.dot)} />
      <span className={cn('text-[10px] font-medium tabular-nums', c.text)}>{score}</span>
    </span>
  );
}

// ─── Failure sparkline (last 7 attempts) ─────────────────────
// Infers recent history from consecutiveFailures + totalItemsIngested

export function FailureSparkline({ consecutiveFailures }: { consecutiveFailures: number }) {
  // Build a 7-bar pattern: most recent failures on the right
  const bars: boolean[] = []; // true = success, false = failure
  const failBars = Math.min(7, consecutiveFailures);
  const successBars = 7 - failBars;
  for (let i = 0; i < successBars; i++) bars.push(true);
  for (let i = 0; i < failBars; i++) bars.push(false);

  return (
    <span className="inline-flex items-end gap-px" title={`${consecutiveFailures} consecutive failures`} data-testid="failure-sparkline">
      {bars.map((ok, i) => (
        <span
          key={i}
          className={cn(
            'inline-block w-1 rounded-sm',
            ok ? 'bg-sev-low h-3' : 'bg-sev-critical h-2',
          )}
        />
      ))}
    </span>
  );
}

// ─── Time helper ──────────────────────────────────────────────

export function formatTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ─── Next fetch countdown ─────────────────────────────────────

export function getNextFireLabel(cron: string | null): string {
  if (!cron) return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron

  const hourField = parts[1] ?? ''
  const now = new Date()
  let nextMs: number | null = null

  const everyN = hourField.match(/^\*\/(\d+)$/)
  if (everyN) {
    const n = parseInt(everyN[1]!, 10)
    const nextHour = Math.ceil((now.getHours() + 1) / n) * n
    const next = new Date(now)
    if (nextHour >= 24) {
      next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0)
    } else {
      next.setHours(nextHour, 0, 0, 0)
    }
    nextMs = next.getTime() - now.getTime()
  }

  const fixedH = hourField.match(/^(\d+)$/)
  if (fixedH && !everyN) {
    const h = parseInt(fixedH[1]!, 10)
    const next = new Date(now)
    next.setHours(h, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    nextMs = next.getTime() - now.getTime()
  }

  if (nextMs === null) return cron
  const totalMins = Math.floor(nextMs / 60_000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `in ${m}m`
  if (m === 0) return `in ${h}h`
  return `in ${h}h ${m}m`
}

// ─── Source favicon ───────────────────────────────────────────

export function FeedFavicon({ url }: { url: string }) {
  let hostname = ''
  try { hostname = new URL(url).hostname } catch { return null }
  if (!hostname) return null
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=16`}
      alt=""
      aria-hidden="true"
      className="w-4 h-4 rounded-sm flex-shrink-0 mt-0.5"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// ─── Feed card ────────────────────────────────────────────────

interface FeedCardProps {
  feed: FeedRecord
}

export function FeedCard({ feed }: FeedCardProps) {
  const isDimmed = !feed.enabled || feed.status === 'disabled'

  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-bg-primary p-3',
        'transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5',
        isDimmed && 'opacity-60',
        feed.status === 'error' && 'border-sev-critical/30 bg-sev-critical/5',
      )}
    >
      {/* Header: favicon + name + type icon */}
      <div className="flex items-start gap-2 mb-2">
        {feed.url && <FeedFavicon url={feed.url} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary truncate">{feed.name}</span>
            <FeedTypeIcon type={feed.feedType} />
          </div>
          {feed.status !== 'error' && feed.description && (
            <div className="text-[10px] text-text-muted truncate">{feed.description}</div>
          )}
          {feed.status === 'error' && feed.lastErrorMessage && (
            <div
              className="text-[10px] text-sev-critical truncate"
              title={feed.lastErrorMessage}
            >
              ⚠ {feed.lastErrorMessage}
            </div>
          )}
          {feed.status === 'error' && feed.lastErrorAt && (
            <div className="text-[10px] text-text-muted">
              failed {formatTime(feed.lastErrorAt)} · {feed.consecutiveFailures} consecutive
            </div>
          )}
        </div>
      </div>

      {/* Status + health + reliability gauge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusDot status={feed.status} />
          <HealthDot score={computeFeedHealth(feed)} />
        </div>
        <ReliabilityBar value={feed.feedReliability} />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div>
          <div className="text-text-muted">Next fetch</div>
          <div className={cn('tabular-nums', isDimmed ? 'text-text-muted' : 'text-text-secondary')}>
            {isDimmed ? '—' : getNextFireLabel(feed.schedule)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Ingested</div>
          <div className="text-text-secondary tabular-nums">
            {feed.totalItemsIngested.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Last fetch</div>
          <div className={cn(
            'tabular-nums',
            feed.consecutiveFailures > 0 ? 'text-sev-critical' : 'text-text-muted',
          )}>
            {formatTime(feed.lastFetchAt)}
          </div>
        </div>
      </div>
    </div>
  )
}
