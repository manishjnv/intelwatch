/**
 * @module components/viz/EnrichmentDetailPanel
 * @description Enrichment data panel for IOC detail view.
 * Shows: evidence chain, MITRE badges, FP detection, recommended actions,
 * STIX labels, quality score, geolocation, cost breakdown.
 * Wired to enrichment API via useIOCCost hook.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useIOCCost, useTriggerEnrichment } from '@/hooks/use-enrichment-data'
import type { EnrichmentResult, IOCCostBreakdown } from '@/hooks/use-enrichment-data'
import { DEMO_ENRICHMENT_RESULT, DEMO_IOC_COST } from '@/hooks/demo-data'
import {
  ChevronDown, Shield, AlertTriangle, CheckCircle, XCircle,
  Zap, Globe, Brain, Target, ExternalLink, RefreshCw,
  Flag, Wifi,
} from 'lucide-react'

// ─── Collapsible Section ────────────────────────────────────────

function Section({ title, badge, defaultOpen = true, children }: {
  title: string; badge?: string | number; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-bg-elevated hover:bg-bg-hover transition-colors text-xs font-medium text-text-primary"
      >
        <span className="flex items-center gap-1.5">
          {title}
          {badge !== undefined && (
            <span className="px-1.5 py-0.5 bg-bg-secondary text-text-muted text-[10px] rounded-full border border-border">{badge}</span>
          )}
        </span>
        <ChevronDown className={cn('w-3 h-3 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.15 }} className="overflow-hidden"
          >
            <div className="p-3 bg-bg-primary text-xs">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Quality Gauge ──────────────────────────────────────────────

function QualityGauge({ value }: { value: number }) {
  const color = value >= 70 ? 'var(--sev-low)' : value >= 40 ? 'var(--sev-medium)' : 'var(--sev-critical)'
  const r = 20, cx = 24, cy = 24, stroke = 4
  const circumference = 2 * Math.PI * r
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="flex items-center gap-2" title={`Enrichment Quality: ${value}/100`}>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700"
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-primary)" fontSize="12" fontWeight="700">{value}</text>
      </svg>
      <div>
        <p className="text-text-primary font-medium">Quality Score</p>
        <p className="text-text-muted text-[10px]">Enrichment completeness</p>
      </div>
    </div>
  )
}

// ─── Country Flag Emoji ─────────────────────────────────────────

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ''
  const offset = 0x1F1E6 - 65
  return String.fromCodePoint(
    code.charCodeAt(0) + offset,
    code.charCodeAt(1) + offset,
  )
}

// ─── Severity colors ────────────────────────────────────────────

const sevColor: Record<string, string> = {
  CRITICAL: 'bg-sev-critical/20 text-red-300',
  HIGH: 'bg-sev-high/20 text-orange-300',
  MEDIUM: 'bg-sev-medium/20 text-yellow-300',
  LOW: 'bg-sev-low/20 text-green-300',
  INFO: 'bg-bg-elevated text-text-muted',
}

const priorityColor: Record<string, string> = {
  immediate: 'text-red-300 bg-red-500/10 border-red-500/20',
  short_term: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  long_term: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
}

// ─── Main Component ─────────────────────────────────────────────

interface EnrichmentDetailPanelProps {
  iocId: string
  iocType: string
  enrichment: EnrichmentResult | null
  className?: string
}

export function EnrichmentDetailPanel({ iocId, iocType, enrichment, className }: EnrichmentDetailPanelProps) {
  const { data: costData } = useIOCCost(enrichment?.enrichmentStatus === 'enriched' ? iocId : null)
  const triggerMutation = useTriggerEnrichment()

  // Use demo data when no real enrichment data exists
  const e = enrichment ?? DEMO_ENRICHMENT_RESULT
  const cost: IOCCostBreakdown | undefined = costData ?? (enrichment ? undefined : DEMO_IOC_COST)
  const h = e.haikuResult
  const vt = e.vtResult
  const abuse = e.abuseipdbResult
  const geo = e.geolocation

  const isEnriched = e.enrichmentStatus === 'enriched' || e.enrichmentStatus === 'partial'

  return (
    <div className={cn('space-y-2 overflow-y-auto', className)}>
      {/* Status + quality header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            e.enrichmentStatus === 'enriched' && 'bg-sev-low/20 text-green-300',
            e.enrichmentStatus === 'partial' && 'bg-sev-medium/20 text-yellow-300',
            e.enrichmentStatus === 'pending' && 'bg-accent/20 text-accent',
            e.enrichmentStatus === 'failed' && 'bg-sev-critical/20 text-red-300',
            e.enrichmentStatus === 'skipped' && 'bg-bg-elevated text-text-muted',
          )}>
            {e.enrichmentStatus}
          </span>
          {e.enrichedAt && (
            <span className="text-[10px] text-text-muted">
              {new Date(e.enrichedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {!isEnriched && (
          <button
            onClick={() => triggerMutation.mutate(iocId)}
            disabled={triggerMutation.isPending}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', triggerMutation.isPending && 'animate-spin')} />
            Enrich
          </button>
        )}
      </div>

      {/* Quality + Risk Score */}
      {isEnriched && (
        <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border">
          {e.enrichmentQuality != null && <QualityGauge value={e.enrichmentQuality} />}
          {e.externalRiskScore != null && (
            <div className="text-right">
              <p className="text-2xl font-bold text-text-primary tabular-nums">{e.externalRiskScore}</p>
              <p className="text-[10px] text-text-muted">Risk Score</p>
            </div>
          )}
        </div>
      )}

      {/* False Positive Detection */}
      {h?.isFalsePositive && (
        <div className="flex items-start gap-2 p-2 bg-sev-low/5 border border-sev-low/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-green-300">False Positive Detected</p>
            {h.falsePositiveReason && <p className="text-[10px] text-text-secondary mt-0.5">{h.falsePositiveReason}</p>}
          </div>
        </div>
      )}

      {!isEnriched && (
        <div className="p-4 text-center text-text-muted text-xs">
          <Brain className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p>Not yet enriched. Click "Enrich" to queue AI analysis.</p>
        </div>
      )}

      {isEnriched && h && (
        <>
          {/* AI Triage Summary */}
          <Section title="AI Triage" badge={h.severity} defaultOpen={true}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', sevColor[h.severity])}>
                  {h.severity}
                </span>
                <span className="text-text-muted">|</span>
                <span className="text-text-secondary">{h.threatCategory}</span>
              </div>
              <p className="text-text-secondary leading-relaxed">{h.reasoning}</p>
            </div>
          </Section>

          {/* Evidence Chain */}
          {h.evidenceSources.length > 0 && (
            <Section title="Evidence Chain" badge={h.evidenceSources.length}>
              <table className="w-full">
                <thead>
                  <tr className="text-text-muted text-[10px] uppercase">
                    <th className="text-left pb-1 font-medium">Provider</th>
                    <th className="text-left pb-1 font-medium">Data Point</th>
                    <th className="text-left pb-1 font-medium">Interpretation</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {h.evidenceSources.map((ev, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="py-1.5 pr-2 text-text-primary font-medium whitespace-nowrap">{ev.provider}</td>
                      <td className="py-1.5 pr-2">{ev.dataPoint}</td>
                      <td className="py-1.5">{ev.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {h.uncertaintyFactors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-[10px] text-text-muted uppercase mb-1">Uncertainty Factors</p>
                  <ul className="space-y-0.5">
                    {h.uncertaintyFactors.map((u, i) => (
                      <li key={i} className="text-text-secondary flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 text-sev-medium mt-0.5 shrink-0" />
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* MITRE ATT&CK Techniques */}
          {h.mitreTechniques.length > 0 && (
            <Section title="MITRE ATT&CK" badge={h.mitreTechniques.length}>
              <div className="flex flex-wrap gap-1.5">
                {h.mitreTechniques.map((t) => (
                  <a
                    key={t.techniqueId}
                    href={`https://attack.mitre.org/techniques/${t.techniqueId.replace('.', '/')}/`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/15 transition-colors"
                    title={`${t.tactic}: ${t.name}`}
                  >
                    <Target className="w-3 h-3" />
                    <span className="font-mono">{t.techniqueId}</span>
                    <span className="text-text-muted">—</span>
                    <span className="text-text-secondary">{t.name}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Recommended Actions */}
          {h.recommendedActions.length > 0 && (
            <Section title="Recommended Actions" badge={h.recommendedActions.length}>
              <div className="space-y-1.5">
                {h.recommendedActions.map((a, i) => (
                  <div key={i} className={cn('flex items-start gap-2 p-2 rounded border', priorityColor[a.priority])}>
                    <Zap className="w-3 h-3 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-text-primary">{a.action}</p>
                      <p className="text-[10px] opacity-70 capitalize mt-0.5">{a.priority.replace('_', ' ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* STIX Labels */}
          {h.stixLabels.length > 0 && (
            <Section title="STIX 2.1 Labels" badge={h.stixLabels.length} defaultOpen={false}>
              <div className="flex flex-wrap gap-1">
                {h.stixLabels.map((l) => (
                  <span key={l} className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">{l}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Geolocation (IP only) */}
          {geo && (iocType === 'ip' || iocType === 'ipv6') && (
            <Section title="Geolocation" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <Flag className="w-3 h-3 text-text-muted" />
                  <span className="text-text-primary">{countryFlag(geo.countryCode)} {geo.countryCode}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wifi className="w-3 h-3 text-text-muted" />
                  <span className="text-text-primary truncate" title={geo.isp}>{geo.isp}</span>
                </div>
                <div>
                  <span className="text-text-muted">Usage: </span>
                  <span className="text-text-primary">{geo.usageType}</span>
                </div>
                {geo.isTor && (
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-purple-400" />
                    <span className="text-purple-300 font-medium">Tor Exit Node</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Provider Results */}
          <Section title="Provider Results" defaultOpen={false}>
            <div className="space-y-2">
              {vt && (
                <div className="p-2 bg-bg-elevated rounded border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary flex items-center gap-1">
                      <Shield className="w-3 h-3" /> VirusTotal
                    </span>
                    <span className="text-text-muted">{vt.detectionRate}% detection</span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-red-300">{vt.malicious} malicious</span>
                    <span className="text-orange-300">{vt.suspicious} suspicious</span>
                    <span className="text-green-300">{vt.harmless} harmless</span>
                    <span className="text-text-muted">{vt.undetected} undetected</span>
                  </div>
                </div>
              )}
              {abuse && (
                <div className="p-2 bg-bg-elevated rounded border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> AbuseIPDB
                    </span>
                    <span className="text-text-muted">{abuse.abuseConfidenceScore}% confidence</span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-text-secondary">{abuse.totalReports} reports</span>
                    <span className="text-text-secondary">{abuse.numDistinctUsers} users</span>
                    {abuse.isWhitelisted && <span className="text-green-300">Whitelisted</span>}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Cost Breakdown */}
          {cost && (
            <Section title="Cost Breakdown" badge={`$${cost.totalCostUsd.toFixed(4)}`} defaultOpen={false}>
              <table className="w-full">
                <thead>
                  <tr className="text-text-muted text-[10px] uppercase">
                    <th className="text-left pb-1 font-medium">Provider</th>
                    <th className="text-right pb-1 font-medium">Tokens</th>
                    <th className="text-right pb-1 font-medium">Cost</th>
                    <th className="text-right pb-1 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {cost.providers.map((p, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="py-1 text-text-primary">{p.provider}</td>
                      <td className="py-1 text-right tabular-nums">{p.inputTokens + p.outputTokens || '—'}</td>
                      <td className="py-1 text-right tabular-nums">${p.costUsd.toFixed(4)}</td>
                      <td className="py-1 text-right tabular-nums">{p.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium text-text-primary">
                    <td className="pt-1">Total</td>
                    <td className="pt-1 text-right tabular-nums">{cost.totalTokens}</td>
                    <td className="pt-1 text-right tabular-nums">${cost.totalCostUsd.toFixed(4)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
