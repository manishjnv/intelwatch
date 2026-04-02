/**
 * @module components/widgets/RecentIocWidget
 * Shows the 5 most recently ingested IOCs with severity badges.
 */
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useIOCs } from '@/hooks/use-intel-data'
import { ArrowRight, Shield } from 'lucide-react'

const SEV_DOT: Record<string, string> = {
  critical: 'bg-sev-critical', high: 'bg-sev-high',
  medium: 'bg-sev-medium', low: 'bg-sev-low', info: 'bg-text-muted',
}

const TYPE_SHORT: Record<string, string> = {
  ip: 'IP', domain: 'DOM', url: 'URL', hash_sha256: 'SHA', hash_md5: 'MD5',
  cve: 'CVE', email: 'EMAIL',
}

export function RecentIocWidget() {
  const navigate = useNavigate()
  const { data } = useIOCs({ limit: 5, sortBy: 'createdAt' })
  const iocs = data?.data ?? []

  return (
    <div
      data-testid="recent-ioc-widget"
      onClick={() => navigate('/iocs')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-xs font-medium text-text-primary">Recent IOCs</span>
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {iocs.length === 0 ? (
        <p className="text-[10px] text-text-muted py-2">No IOCs ingested yet</p>
      ) : (
      <div className="space-y-1.5">
        {iocs.map(ioc => (
          <div key={ioc.id} className="flex items-center gap-2">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', SEV_DOT[ioc.severity] ?? 'bg-text-muted')} />
            <span className="text-[10px] text-text-muted w-7 shrink-0">{TYPE_SHORT[ioc.iocType] ?? ioc.iocType}</span>
            <span className="text-xs text-text-secondary font-mono truncate flex-1">{ioc.normalizedValue}</span>
            <span className="text-[10px] text-text-muted tabular-nums shrink-0">
              {ioc.confidence}%
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
