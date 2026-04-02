/**
 * @module components/investigation/InvestigationDrawer
 * Slide-over drawer for IOC investigation. Shows enrichment summary,
 * related actors, timestamps, corroboration, and action buttons.
 */
import { useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Copy, Search, ExternalLink, Shield, Clock,
  Globe, AlertTriangle, Eye, Users,
} from 'lucide-react'
import { useInvestigationDrawer } from '@/hooks/use-investigation-drawer'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { getFreshness } from '@/lib/freshness'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Severity badge                                                      */
/* ------------------------------------------------------------------ */
const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-300 border-green-500/30',
  info: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

/* ------------------------------------------------------------------ */
/* Demo enrichment data — used when real enrichment isn't available    */
/* ------------------------------------------------------------------ */
const DEMO_ENRICHMENT: Record<string, { source: string; verdict: string; detail: string }[]> = {
  ip: [
    { source: 'VirusTotal', verdict: 'Malicious', detail: '12/90 vendors flagged' },
    { source: 'Shodan', verdict: 'Open ports', detail: '22, 80, 443, 8080' },
    { source: 'GreyNoise', verdict: 'Malicious', detail: 'Known scanner' },
  ],
  domain: [
    { source: 'VirusTotal', verdict: 'Suspicious', detail: '4/90 vendors flagged' },
    { source: 'WHOIS', verdict: 'Recently registered', detail: 'Created 14 days ago' },
  ],
  hash: [
    { source: 'VirusTotal', verdict: 'Malicious', detail: '38/72 engines detected' },
  ],
  cve: [
    { source: 'EPSS', verdict: 'High risk', detail: 'Exploitation probability > 50%' },
    { source: 'CISA KEV', verdict: 'In catalog', detail: 'Known exploited vulnerability' },
  ],
  url: [
    { source: 'VirusTotal', verdict: 'Phishing', detail: '8/90 vendors flagged' },
    { source: 'Google Safe Browsing', verdict: 'Unsafe', detail: 'Social engineering' },
  ],
  email: [
    { source: 'WHOIS', verdict: 'Associated', detail: 'Linked to 3 domains' },
  ],
}

/* ------------------------------------------------------------------ */
/* Actor → country mapping (heuristic for related actors)             */
/* ------------------------------------------------------------------ */
const ACTOR_COUNTRY: Record<string, string> = {
  'APT28 (Fancy Bear)': 'Russia', 'Lazarus Group': 'North Korea', 'FIN7': 'Russia',
  'APT41': 'China', 'Charming Kitten': 'Iran', 'Kimsuky': 'North Korea',
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function InvestigationDrawer() {
  const { isOpen, payload, close } = useInvestigationDrawer()
  const { topActors, topIocs } = useAnalyticsDashboard()
  const navigate = useNavigate()

  // Escape key handler
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }, [close])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown)
      return () => document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onKeyDown])

  // Derived data
  const enrichments = useMemo(() => {
    if (!payload) return []
    return DEMO_ENRICHMENT[payload.type] ?? DEMO_ENRICHMENT.ip
  }, [payload])

  const relatedActors = useMemo(() => {
    if (!payload) return []
    return topActors.slice(0, 3)
  }, [payload, topActors])

  const freshness = payload?.lastSeen
    ? getFreshness(payload.lastSeen)
    : payload?.createdAt
      ? getFreshness(payload.createdAt)
      : null

  // Find corroboration from topIocs
  const corroboration = useMemo(() => {
    if (!payload) return 0
    const match = topIocs.find(i => i.value === payload.value)
    return payload.corroboration ?? match?.corroboration ?? 0
  }, [payload, topIocs])

  const copyIoc = useCallback(() => {
    if (payload?.value) {
      navigator.clipboard.writeText(payload.value).catch(() => {})
    }
  }, [payload])

  const searchIoc = useCallback(() => {
    if (payload?.value) {
      navigate(`/iocs?search=${encodeURIComponent(payload.value)}`)
      close()
    }
  }, [payload, navigate, close])

  return (
    <AnimatePresence>
      {isOpen && payload && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="investigation-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={close}
          />

          {/* Drawer panel */}
          <motion.div
            data-testid="investigation-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full z-50 bg-bg-primary border-l border-border
              w-full sm:w-[400px] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-bg-primary/95 backdrop-blur-sm border-b border-border p-4 z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    IOC Investigation
                  </span>
                </div>
                <button
                  data-testid="drawer-close"
                  onClick={close}
                  className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* IOC value + type + severity */}
              <div className="flex items-start gap-2">
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5',
                  SEV_COLORS[payload.severity ?? 'info'],
                )}>
                  {(payload.severity ?? 'info').toUpperCase()}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted shrink-0 mt-0.5">
                  {payload.type.toUpperCase()}
                </span>
                <span className="text-sm font-mono text-text-primary break-all flex-1">
                  {payload.value}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-5">
              {/* Timestamps + Freshness */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-secondary">Timestamps</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-bg-secondary">
                    <div className="text-text-muted mb-0.5">First seen</div>
                    <div className="text-text-primary">
                      {payload.createdAt
                        ? new Date(payload.createdAt).toLocaleDateString()
                        : 'Unknown'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-bg-secondary">
                    <div className="text-text-muted mb-0.5">Last seen</div>
                    <div className="text-text-primary flex items-center gap-1">
                      {freshness && (
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          freshness.dot,
                          freshness.pulse && 'animate-pulse',
                        )} />
                      )}
                      {payload.lastSeen
                        ? freshness?.label ?? new Date(payload.lastSeen).toLocaleDateString()
                        : 'Unknown'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Enrichment Summary */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Eye className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-secondary">Enrichment</span>
                </div>
                {enrichments.length === 0 ? (
                  <p className="text-[11px] text-text-muted p-2 bg-bg-secondary rounded">
                    Not yet enriched
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {enrichments.map(e => (
                      <div key={e.source} className="flex items-center gap-2 p-2 bg-bg-secondary rounded">
                        <span className="text-[10px] font-medium text-accent w-20 shrink-0">{e.source}</span>
                        <span className="text-[11px] text-text-primary flex-1">{e.verdict}</span>
                        <span className="text-[10px] text-text-muted">{e.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Corroboration */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-secondary">Corroboration</span>
                </div>
                <div className="p-2 bg-bg-secondary rounded text-[11px]">
                  {corroboration > 0 ? (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={cn(
                        'w-3.5 h-3.5',
                        corroboration >= 4 ? 'text-red-400' : corroboration >= 2 ? 'text-yellow-400' : 'text-text-muted',
                      )} />
                      <span className="text-text-primary">
                        Reported by <strong>{corroboration}</strong> source{corroboration !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ) : (
                    <span className="text-text-muted">Single-source indicator</span>
                  )}
                </div>
              </section>

              {/* Related Threat Actors */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-secondary">Related Actors</span>
                </div>
                {relatedActors.length === 0 ? (
                  <p className="text-[11px] text-text-muted p-2 bg-bg-secondary rounded">
                    No related actors found
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {relatedActors.map(a => (
                      <div key={a.name} className="flex items-center gap-2 p-2 bg-bg-secondary rounded">
                        <span className="text-[11px] text-text-primary flex-1">{a.name}</span>
                        <span className="text-[10px] text-text-muted">
                          {ACTOR_COUNTRY[a.name] ?? ''}
                        </span>
                        <span className="text-[10px] tabular-nums text-text-muted">
                          {a.iocCount} IOCs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Confidence */}
              {payload.confidence != null && (
                <section>
                  <div className="flex items-center justify-between p-2 bg-bg-secondary rounded">
                    <span className="text-[11px] text-text-secondary">Confidence</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${payload.confidence}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-text-primary tabular-nums">
                        {payload.confidence}%
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Action buttons — sticky bottom */}
            <div className="sticky bottom-0 p-4 bg-bg-primary/95 backdrop-blur-sm border-t border-border">
              <div className="flex gap-2">
                <button
                  data-testid="action-copy"
                  onClick={copyIoc}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md
                    bg-bg-secondary border border-border text-xs text-text-secondary
                    hover:text-text-primary hover:border-border-strong transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy IOC
                </button>
                <button
                  data-testid="action-search"
                  onClick={searchIoc}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md
                    bg-bg-secondary border border-border text-xs text-text-secondary
                    hover:text-text-primary hover:border-border-strong transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search
                </button>
                <button
                  data-testid="action-details"
                  onClick={searchIoc}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md
                    bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Details
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
