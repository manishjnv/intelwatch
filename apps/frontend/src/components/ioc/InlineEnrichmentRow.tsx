/**
 * @module components/ioc/InlineEnrichmentRow
 * @description Compact inline enrichment summary for expandable table rows.
 * Shows VT ratio, AbuseIPDB score, geo flag, risk verdict. Feature 5.
 */
import { Loader2 } from 'lucide-react'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'

interface EnrichmentSummary {
  vtDetections?: number
  vtTotal?: number
  abuseipdbScore?: number
  country?: string
  countryCode?: string
  severity?: string
  riskVerdict?: string
}

interface InlineEnrichmentRowProps {
  enrichment: EnrichmentSummary | null
  isLoading: boolean
}

/** Convert country code to flag emoji */
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function InlineEnrichmentRow({ enrichment, isLoading }: InlineEnrichmentRowProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-text-muted" data-testid="enrichment-loading">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading enrichment data...
      </div>
    )
  }

  if (!enrichment) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-text-muted" data-testid="enrichment-empty">
        No enrichment data available. Enrichment runs automatically after ingestion.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 bg-bg-elevated/30 border-t border-border/30" data-testid="inline-enrichment">
      {/* VT Detection */}
      {enrichment.vtDetections != null && enrichment.vtTotal != null && (
        <div className="flex items-center gap-1.5" data-testid="vt-ratio">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">VT</span>
          <span className={`text-xs font-mono font-semibold ${vtColor(enrichment.vtDetections, enrichment.vtTotal)}`}>
            {enrichment.vtDetections}/{enrichment.vtTotal}
          </span>
          <span className="text-[10px] text-text-muted">
            ({Math.round((enrichment.vtDetections / Math.max(1, enrichment.vtTotal)) * 100)}%)
          </span>
        </div>
      )}

      {/* AbuseIPDB */}
      {enrichment.abuseipdbScore != null && (
        <div className="flex items-center gap-1.5" data-testid="abuseipdb-score">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">AbuseIPDB</span>
          <span className={`text-xs font-mono font-semibold ${abuseColor(enrichment.abuseipdbScore)}`}>
            {enrichment.abuseipdbScore}%
          </span>
        </div>
      )}

      {/* Geo */}
      {enrichment.countryCode && (
        <div className="flex items-center gap-1" data-testid="geo-info">
          <span className="text-sm">{countryFlag(enrichment.countryCode)}</span>
          <span className="text-xs text-text-secondary">{enrichment.country ?? enrichment.countryCode}</span>
        </div>
      )}

      {/* Risk verdict */}
      {enrichment.severity && (
        <div className="flex items-center gap-1.5" data-testid="risk-verdict">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Risk</span>
          <SeverityBadge severity={enrichment.severity} />
        </div>
      )}

      {enrichment.riskVerdict && (
        <span className="text-[10px] text-text-secondary italic ml-auto hidden sm:block">{enrichment.riskVerdict}</span>
      )}
    </div>
  )
}

function vtColor(det: number, total: number): string {
  const ratio = det / Math.max(1, total)
  if (ratio >= 0.5) return 'text-sev-critical'
  if (ratio >= 0.2) return 'text-sev-high'
  if (ratio >= 0.05) return 'text-sev-medium'
  return 'text-sev-low'
}

function abuseColor(score: number): string {
  if (score >= 80) return 'text-sev-critical'
  if (score >= 50) return 'text-sev-high'
  if (score >= 20) return 'text-sev-medium'
  return 'text-sev-low'
}
