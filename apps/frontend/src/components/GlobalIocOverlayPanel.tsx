/**
 * @module components/GlobalIocOverlayPanel
 * @description Slide-out panel for viewing/editing global IOC details + tenant overlay.
 * Sections: Global Data (read-only), Enrichment Details, Tenant Overlay (editable).
 * DECISION-029 Phase C.
 */
import { useState } from 'react'
import { useGlobalIocDetail, useIocOverlay, type GlobalIocRecord, type OverlayInput } from '@/hooks/use-global-iocs'
import { cn } from '@/lib/utils'
import { X, Shield, Globe, AlertTriangle, Save, RotateCcw } from 'lucide-react'

const SEVERITY_OPTIONS = ['info', 'low', 'medium', 'high', 'critical'] as const
const LIFECYCLE_OPTIONS = ['new', 'active', 'aging', 'expired', 'revoked'] as const

function StixTierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    High: 'bg-sev-high/20 text-sev-high', Med: 'bg-amber-400/20 text-amber-400',
    Low: 'bg-sev-low/20 text-sev-low', None: 'bg-text-muted/20 text-text-muted',
  }
  return <span className={cn('px-2 py-0.5 rounded text-xs font-bold', colors[tier] ?? colors.None)}>{tier}</span>
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-sev-critical/20 text-sev-critical', high: 'bg-sev-high/20 text-sev-high',
    medium: 'bg-sev-medium/20 text-sev-medium', low: 'bg-sev-low/20 text-sev-low',
    info: 'bg-text-muted/20 text-text-muted',
  }
  return <span className={cn('px-2 py-0.5 rounded text-xs capitalize font-bold', colors[severity] ?? colors.info)}>{severity}</span>
}

function IocTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = { ip: '🌐', domain: '🔗', hash: '#️⃣', cve: '🛡️', url: '🔗', email: '📧' }
  return <span className="text-lg">{icons[type] ?? '📌'}</span>
}

function EnrichmentQualityBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-sev-low' : value >= 50 ? 'bg-amber-400' : 'bg-sev-high'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded-full bg-bg-elevated overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-text-muted">{value}%</span>
    </div>
  )
}

interface GlobalIocOverlayPanelProps {
  iocId: string | null
  onClose: () => void
}

export function GlobalIocOverlayPanel({ iocId, onClose }: GlobalIocOverlayPanelProps) {
  const { data: ioc, isLoading } = useGlobalIocDetail(iocId)
  const { setOverlay, removeOverlay, isSaving, isRemoving } = useIocOverlay(iocId)
  const [overlay, setOverlayState] = useState<OverlayInput>({})
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  if (!iocId) return null

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-bg-surface border-l border-border shadow-xl z-50 p-6" data-testid="overlay-panel">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-bg-elevated rounded w-3/4" />
          <div className="h-4 bg-bg-elevated rounded w-1/2" />
          <div className="h-32 bg-bg-elevated rounded" />
        </div>
      </div>
    )
  }

  const d = ioc as GlobalIocRecord | null
  if (!d) return null

  const handleSave = () => {
    setOverlay(overlay)
  }

  const handleReset = () => {
    removeOverlay()
    setOverlayState({})
    setShowResetConfirm(false)
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-bg-surface border-l border-border shadow-xl z-50 overflow-y-auto" data-testid="overlay-panel">
      {/* Header */}
      <div className="sticky top-0 bg-bg-surface border-b border-border p-4 flex items-center gap-3 z-10">
        <IocTypeIcon type={d.iocType} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-bold text-text-primary truncate">{d.normalizedValue}</div>
          <div className="flex items-center gap-2 mt-1">
            <StixTierBadge tier={d.stixConfidenceTier} />
            <SeverityBadge severity={d.severity} />
            <span className="text-xs text-text-muted capitalize">{d.lifecycle}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-bg-hover text-text-muted" data-testid="close-panel">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Section 1: Global Data (read-only) */}
        <section>
          <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <Globe size={14} /> Global Data
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Confidence</span>
              <span className="text-text-primary font-bold">{d.confidence}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">STIX Tier</span>
              <StixTierBadge tier={d.stixConfidenceTier} />
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Cross-Feed Corroboration</span>
              <span className="text-accent font-bold">{d.crossFeedCorroboration} feeds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">First Seen</span>
              <span className="text-text-secondary">{new Date(d.firstSeen).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Last Seen</span>
              <span className="text-text-secondary">{new Date(d.lastSeen).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Enrichment Quality</span>
              <EnrichmentQualityBar value={d.enrichmentQuality} />
            </div>
          </div>

          {/* Warninglist match */}
          {d.warninglistMatch && (
            <div className="mt-3 p-2 rounded bg-amber-400/10 border border-amber-400/20 flex items-center gap-2" data-testid="warninglist-banner">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-xs text-amber-400">Warninglist match: {d.warninglistMatch}</span>
            </div>
          )}

          {/* ATT&CK Techniques */}
          {d.attackTechniques && d.attackTechniques.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-text-muted">ATT&CK Techniques:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {d.attackTechniques.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 text-xs font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Affected CPEs */}
          {d.affectedCpes && d.affectedCpes.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-text-muted">Affected CPEs:</span>
              <div className="flex flex-col gap-1 mt-1">
                {d.affectedCpes.map(c => (
                  <span key={c} className="text-xs font-mono text-text-secondary truncate">{c}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Enrichment Details */}
        <section>
          <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <Shield size={14} /> Enrichment Details
          </h3>

          {/* Shodan */}
          {d.enrichmentData?.shodan && (
            <div className="mb-3 p-3 rounded border border-border bg-bg-elevated/50" data-testid="shodan-section">
              <div className="text-xs font-bold text-cyan-400 mb-1">Shodan</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {d.enrichmentData.shodan.org && <div><span className="text-text-muted">Org:</span> {d.enrichmentData.shodan.org}</div>}
                {d.enrichmentData.shodan.isp && <div><span className="text-text-muted">ISP:</span> {d.enrichmentData.shodan.isp}</div>}
                {d.enrichmentData.shodan.country && <div><span className="text-text-muted">Country:</span> {d.enrichmentData.shodan.country}</div>}
                {d.enrichmentData.shodan.riskScore != null && <div><span className="text-text-muted">Risk:</span> <span className="text-sev-high font-bold">{d.enrichmentData.shodan.riskScore}</span></div>}
              </div>
              {d.enrichmentData.shodan.ports && d.enrichmentData.shodan.ports.length > 0 && (
                <div className="mt-1 text-xs">
                  <span className="text-text-muted">Ports:</span> {d.enrichmentData.shodan.ports.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* GreyNoise */}
          {d.enrichmentData?.greynoise && (
            <div className="mb-3 p-3 rounded border border-border bg-bg-elevated/50" data-testid="greynoise-section">
              <div className="text-xs font-bold text-emerald-400 mb-1">GreyNoise</div>
              <div className="flex items-center gap-2 text-xs">
                <span className={cn('px-1.5 py-0.5 rounded font-bold',
                  d.enrichmentData.greynoise.classification === 'malicious' ? 'bg-sev-high/20 text-sev-high' : 'bg-sev-low/20 text-sev-low',
                )}>{d.enrichmentData.greynoise.classification}</span>
                {d.enrichmentData.greynoise.noise && <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400">Noise</span>}
                {d.enrichmentData.greynoise.riot && <span className="px-1.5 py-0.5 rounded bg-sev-low/20 text-sev-low">RIOT</span>}
              </div>
            </div>
          )}

          {/* EPSS */}
          {d.enrichmentData?.epss && (
            <div className="mb-3 p-3 rounded border border-border bg-bg-elevated/50" data-testid="epss-section">
              <div className="text-xs font-bold text-blue-400 mb-1">EPSS (Exploit Prediction)</div>
              <div className="flex items-center gap-4 text-xs">
                <div><span className="text-text-muted">Probability:</span> <span className="font-bold">{(d.enrichmentData.epss.probability! * 100).toFixed(1)}%</span></div>
                <div><span className="text-text-muted">Percentile:</span> <span className="font-bold">{d.enrichmentData.epss.percentile}th</span></div>
              </div>
            </div>
          )}

          {!d.enrichmentData?.shodan && !d.enrichmentData?.greynoise && !d.enrichmentData?.epss && (
            <p className="text-xs text-text-muted italic">No enrichment data available yet</p>
          )}
        </section>

        {/* Section 3: Tenant Overlay (editable) */}
        <section>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Tenant Overlay</h3>
          <div className="space-y-3">
            {/* Severity */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Custom Severity</label>
              <select
                data-testid="overlay-severity"
                className="w-full bg-bg-elevated border border-border rounded px-2 py-1.5 text-sm text-text-primary"
                value={overlay.customSeverity ?? d.overlay?.customSeverity ?? ''}
                onChange={e => setOverlayState(p => ({ ...p, customSeverity: e.target.value || undefined }))}
              >
                <option value="">Use global default</option>
                {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Confidence */}
            <div>
              <label className="text-xs text-text-muted block mb-1">
                Custom Confidence: {overlay.customConfidence ?? d.overlay?.customConfidence ?? d.confidence}
              </label>
              <input
                data-testid="overlay-confidence"
                type="range" min={0} max={100}
                className="w-full accent-accent"
                value={overlay.customConfidence ?? d.overlay?.customConfidence ?? d.confidence}
                onChange={e => setOverlayState(p => ({ ...p, customConfidence: Number(e.target.value) }))}
              />
            </div>

            {/* Lifecycle */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Custom Lifecycle</label>
              <select
                data-testid="overlay-lifecycle"
                className="w-full bg-bg-elevated border border-border rounded px-2 py-1.5 text-sm text-text-primary"
                value={overlay.customLifecycle ?? d.overlay?.customLifecycle ?? ''}
                onChange={e => setOverlayState(p => ({ ...p, customLifecycle: e.target.value || undefined }))}
              >
                <option value="">Use global default</option>
                {LIFECYCLE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Notes</label>
              <textarea
                data-testid="overlay-notes"
                className="w-full bg-bg-elevated border border-border rounded px-2 py-1.5 text-sm text-text-primary min-h-[60px] resize-y"
                value={overlay.customNotes ?? d.overlay?.customNotes ?? ''}
                onChange={e => setOverlayState(p => ({ ...p, customNotes: e.target.value }))}
                placeholder="Add private notes about this IOC..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                data-testid="save-overlay"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent/10 text-accent text-sm hover:bg-accent/20 transition-colors disabled:opacity-50"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Overlay'}
              </button>
              <button
                data-testid="reset-overlay"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sev-high/10 text-sev-high text-sm hover:bg-sev-high/20 transition-colors disabled:opacity-50"
                onClick={() => setShowResetConfirm(true)}
                disabled={isRemoving}
              >
                <RotateCcw size={14} /> Reset to Global
              </button>
            </div>

            {/* Reset confirmation */}
            {showResetConfirm && (
              <div className="p-3 rounded border border-sev-high/30 bg-sev-high/5">
                <p className="text-xs text-text-secondary mb-2">Remove all custom overrides for this IOC?</p>
                <div className="flex gap-2">
                  <button
                    data-testid="confirm-reset"
                    className="px-2 py-1 rounded bg-sev-high text-white text-xs"
                    onClick={handleReset}
                  >
                    Yes, Reset
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-bg-elevated text-text-muted text-xs"
                    onClick={() => setShowResetConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
