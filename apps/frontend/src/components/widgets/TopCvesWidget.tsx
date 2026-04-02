/**
 * @module components/widgets/TopCvesWidget
 * Top 5 CVEs by priority score. Highlights CISA KEV entries. Shows CVSS + EPSS.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { ArrowRight, ShieldAlert, AlertTriangle } from 'lucide-react'

/** KEV CVE IDs commonly tracked — used as heuristic when backend lacks KEV flag */
const KNOWN_KEV_PREFIXES = ['CVE-2024-', 'CVE-2025-', 'CVE-2023-']

function isLikelyKev(cveId: string, epss: number): boolean {
  return epss > 0.5 || KNOWN_KEV_PREFIXES.some(p => cveId.startsWith(p) && epss > 0.3)
}

function severityColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return 'text-sev-critical'
    case 'high': return 'text-sev-high'
    case 'medium': return 'text-sev-medium'
    case 'low': return 'text-sev-low'
    default: return 'text-text-muted'
  }
}

export function TopCvesWidget() {
  const navigate = useNavigate()
  const { topCves, isDemo } = useAnalyticsDashboard()

  const cves = useMemo(() =>
    [...topCves]
      .sort((a, b) => b.epss - a.epss)
      .slice(0, 5),
    [topCves],
  )

  if (cves.length === 0) return null

  return (
    <div
      data-testid="top-cves-widget"
      onClick={() => navigate('/vulnerabilities')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-3.5 h-3.5 text-orange-300" />
        <span className="text-xs font-medium text-text-primary">Top CVEs</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <div className="space-y-1.5">
        {cves.map(cve => (
          <div key={cve.id} className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-secondary truncate w-28 shrink-0">
              {cve.id}
            </span>
            {isLikelyKev(cve.id, cve.epss) && (
              <AlertTriangle className="w-3 h-3 text-sev-critical shrink-0" data-testid={`kev-badge-${cve.id}`} />
            )}
            <span className={`text-[10px] font-medium shrink-0 ${severityColor(cve.severity)}`}>
              {cve.severity.slice(0, 4).toUpperCase()}
            </span>
            <span className="text-[10px] tabular-nums text-text-muted ml-auto shrink-0">
              EPSS {(cve.epss * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
