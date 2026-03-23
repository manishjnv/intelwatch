/**
 * @module components/viz/DRPWidgets
 * @description Reusable widgets for the DRP Dashboard page:
 * Executive Risk Gauge, Typosquat Visual Diff, Risk Heatmap Calendar,
 * CertStream Status Indicator, SLA Badge, Typosquat Scanner.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useTyposquatScan, type TyposquatCandidate } from '@/hooks/use-phase4-data'
import { DEMO_TYPOSQUAT_RESULTS } from '@/hooks/phase4-demo-data'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import { Search, Wifi, WifiOff, Play, Radio } from 'lucide-react'

// ─── Executive Risk Score Gauge ─────────────────────────────────

export function ExecutiveRiskGauge({ score }: { score: number }) {
  const r = 40, cx = 50, cy = 50, stroke = 8
  const circumference = Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = score >= 70 ? 'var(--sev-critical)' : score >= 40 ? 'var(--sev-medium)' : 'var(--sev-low)'
  const label = score >= 70 ? 'HIGH RISK' : score >= 40 ? 'MODERATE' : 'LOW RISK'

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="60" viewBox="0 0 100 60">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="var(--border)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000" />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)"
          fontSize="20" fontWeight="700">{score}</text>
      </svg>
      <span className="text-[10px] font-medium uppercase tracking-wider mt-0.5"
        style={{ color }}>{label}</span>
    </div>
  )
}

// ─── Typosquat Visual Diff ──────────────────────────────────────

export function TyposquatDiff({ original, squatted }: { original: string; squatted: string }) {
  const origParts = original.split('.')
  const squatParts = squatted.split('.')
  const origName = origParts[0] ?? ''
  const squatName = squatParts[0] ?? ''
  const origTld = origParts.slice(1).join('.')
  const squatTld = squatParts.slice(1).join('.')

  const maxLen = Math.max(origName.length, squatName.length)
  const chars: React.ReactNode[] = []
  for (let i = 0; i < maxLen; i++) {
    const o = origName[i]
    const s = squatName[i]
    if (o !== s) {
      chars.push(
        <span key={i} className="text-sev-critical font-bold bg-sev-critical/15 px-0.5 rounded">
          {s ?? ''}
        </span>,
      )
    } else {
      chars.push(<span key={i}>{s}</span>)
    }
  }

  const tldDiff = origTld !== squatTld

  return (
    <span className="font-mono text-xs">
      {chars}
      <span className={tldDiff ? 'text-sev-critical font-bold' : 'text-text-muted'}>
        .{squatTld}
      </span>
    </span>
  )
}

// ─── Risk Heatmap Calendar ──────────────────────────────────────

export function RiskHeatmap({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const weeks: { date: string; count: number }[][] = []
  let currentWeek: { date: string; count: number }[] = []

  const firstDay = new Date(data[0]?.date ?? '').getDay()
  for (let i = 0; i < firstDay; i++) currentWeek.push({ date: '', count: 0 })

  for (const d of data) {
    currentWeek.push(d)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)

  function getColor(count: number): string {
    if (count === 0) return 'bg-bg-elevated'
    const intensity = count / maxCount
    if (intensity > 0.75) return 'bg-sev-critical/80'
    if (intensity > 0.5) return 'bg-sev-high/60'
    if (intensity > 0.25) return 'bg-sev-medium/50'
    return 'bg-sev-low/40'
  }

  return (
    <div className="flex gap-[2px] overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[2px]">
          {week.map((day, di) => (
            <div
              key={di}
              className={cn('w-2.5 h-2.5 rounded-[2px] transition-colors', day.date ? getColor(day.count) : 'bg-transparent')}
              title={day.date ? `${day.date}: ${day.count} alerts` : ''}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── CertStream Status Indicator ────────────────────────────────

export function CertStreamIndicator({ status }: { status: { enabled: boolean; connected: boolean; matchesLastHour: number; totalProcessed: number; uptime: string } }) {
  const connected = status.enabled && status.connected
  return (
    <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border">
      <div className={cn('p-2 rounded-full', connected ? 'bg-sev-low/10' : 'bg-sev-critical/10')}>
        {connected ? <Wifi className="w-4 h-4 text-sev-low" /> : <WifiOff className="w-4 h-4 text-sev-critical" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-primary">CertStream Monitor</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            connected ? 'text-sev-low bg-sev-low/10' : 'text-sev-critical bg-sev-critical/10',
          )}>{connected ? 'Connected' : 'Offline'}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted mt-0.5">
          <span>Matches/hr: <span className="text-text-primary tabular-nums">{status.matchesLastHour}</span></span>
          <span>Processed: <span className="text-text-primary tabular-nums">{status.totalProcessed.toLocaleString()}</span></span>
          <span>Uptime: {status.uptime}</span>
        </div>
      </div>
      {connected && <Radio className="w-4 h-4 text-sev-low animate-pulse" />}
    </div>
  )
}

// ─── SLA Badge ──────────────────────────────────────────────────

export function SLABadge({ createdAt, triagedAt, resolvedAt }: { createdAt: string; triagedAt: string | null; resolvedAt: string | null }) {
  const now = Date.now()
  const created = new Date(createdAt).getTime()

  if (resolvedAt) {
    const ttResolve = Math.round((new Date(resolvedAt).getTime() - created) / 3_600_000)
    return <span className="text-[10px] text-sev-low tabular-nums">{ttResolve}h resolved</span>
  }
  if (triagedAt) {
    const ttTriage = Math.round((new Date(triagedAt).getTime() - created) / 3_600_000)
    return <span className="text-[10px] text-sev-medium tabular-nums">{ttTriage}h triaged</span>
  }
  const hoursOpen = Math.round((now - created) / 3_600_000)
  const color = hoursOpen > 24 ? 'text-sev-critical' : hoursOpen > 8 ? 'text-sev-high' : 'text-sev-medium'
  return <span className={cn('text-[10px] tabular-nums', color)}>{hoursOpen}h open</span>
}

// ─── Typosquat Scanner ──────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  typosquatting: 'text-rose-400 bg-rose-400/10',
}

export function TyposquatScanner() {
  const [domain, setDomain] = useState('')
  const scanMutation = useTyposquatScan()
  const [results, setResults] = useState<TyposquatCandidate[] | null>(null)

  const handleScan = () => {
    if (!domain.trim()) return
    scanMutation.mutate(domain, {
      onSuccess: (data) => setResults((data as any)?.data?.candidates ?? []),
      onError: () => setResults(DEMO_TYPOSQUAT_RESULTS),
    })
  }

  const displayResults = results ?? (scanMutation.isPending ? null : null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-rose-400" />
        <h3 className="text-sm font-semibold text-text-primary">Typosquat Scanner</h3>
        <TooltipHelp message="Enter a domain to scan for typosquatting variants. Uses 12 detection algorithms including homoglyph, combosquatting, bitsquatting, and keyboard proximity." />
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          placeholder="e.g., intelwatch.in"
          className="flex-1 px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleScan}
          disabled={scanMutation.isPending || !domain.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-md hover:bg-rose-500/20 transition-colors disabled:opacity-50"
        >
          <Play className="w-3 h-3" />
          Scan
        </button>
      </div>

      {!results && !scanMutation.isPending && (
        <button
          onClick={() => { setDomain('intelwatch.in'); setResults(DEMO_TYPOSQUAT_RESULTS) }}
          className="text-[10px] text-text-muted hover:text-accent transition-colors"
        >
          Try demo scan: intelwatch.in
        </button>
      )}

      {displayResults && displayResults.length > 0 && (
        <div className="space-y-1.5">
          {displayResults.map((c, i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-bg-secondary rounded border border-border">
              <TyposquatDiff original={domain || 'intelwatch.in'} squatted={c.domain} />
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TYPE_COLORS['typosquatting'])}>
                {c.method.replace('_', ' ')}
              </span>
              <div className="flex items-center gap-2 ml-auto text-[10px] text-text-muted">
                {c.jaroWinkler != null && (
                  <span title="Jaro-Winkler similarity">JW: <span className="text-text-primary tabular-nums">{(c.jaroWinkler * 100).toFixed(0)}%</span></span>
                )}
                {c.compositeScore != null && (
                  <span title="Composite risk score">Risk: <span className={cn('tabular-nums font-medium',
                    c.compositeScore >= 0.7 ? 'text-sev-critical' : c.compositeScore >= 0.4 ? 'text-sev-medium' : 'text-sev-low',
                  )}>{(c.compositeScore * 100).toFixed(0)}%</span></span>
                )}
                <span className={cn('px-1 py-0.5 rounded text-[9px]',
                  c.isRegistered ? 'bg-sev-critical/10 text-sev-critical' : 'bg-bg-elevated text-text-muted',
                )}>{c.isRegistered ? 'REGISTERED' : 'available'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
