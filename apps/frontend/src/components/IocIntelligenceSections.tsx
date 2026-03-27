/**
 * @module components/IocIntelligenceSections
 * @description Corroboration, severity voting, and community FP sections for the IOC overlay panel.
 * Extracted from GlobalIocOverlayPanel to stay under 400-line limit.
 * DECISION-029 Phase G.
 */
import { useState } from 'react'
import {
  useCorroborationDetail, useSeverityVotes, useFpSummary, useFpActions,
} from '@/hooks/use-global-iocs'
import { cn } from '@/lib/utils'
import { Eye, Vote, Flag } from 'lucide-react'

function CorroborationTierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    uncorroborated: 'bg-text-muted/20 text-text-muted',
    low: 'bg-yellow-400/20 text-yellow-400',
    medium: 'bg-amber-400/20 text-amber-400',
    high: 'bg-blue-400/20 text-blue-400',
    confirmed: 'bg-sev-low/20 text-sev-low',
  }
  return <span className={cn('px-2 py-0.5 rounded text-xs font-bold capitalize', colors[tier] ?? colors.uncorroborated)} data-testid="corroboration-tier">{tier}</span>
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-sev-critical/20 text-sev-critical', high: 'bg-sev-high/20 text-sev-high',
    medium: 'bg-sev-medium/20 text-sev-medium', low: 'bg-sev-low/20 text-sev-low',
    info: 'bg-text-muted/20 text-text-muted',
  }
  return <span className={cn('px-2 py-0.5 rounded text-xs capitalize font-bold', colors[severity] ?? colors.info)}>{severity}</span>
}

// ── Corroboration Section ────────────────────────────────────

export function CorroborationSection({ iocId }: { iocId: string | null }) {
  const { data: corroboration } = useCorroborationDetail(iocId)
  if (!corroboration) return null

  return (
    <section data-testid="corroboration-section">
      <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
        <Eye size={14} /> Corroboration
      </h3>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl font-bold text-text-primary">{corroboration.score}</span>
        <CorroborationTierBadge tier={corroboration.tier} />
      </div>
      <p className="text-xs text-text-muted mb-2">Seen by {corroboration.sourceCount} independent feed(s)</p>
      <div className="mb-2">
        <span className="text-xs text-text-muted">Independence:</span>
        <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden mt-1">
          <div className="h-full rounded-full bg-accent" style={{ width: `${corroboration.independenceScore}%` }} />
        </div>
      </div>
      {corroboration.sources && corroboration.sources.length > 0 && (
        <div className="space-y-1 mb-2" data-testid="corroboration-sources">
          {corroboration.sources.map(s => (
            <div key={s.feedId} className="flex items-center gap-2 text-xs">
              <span className="px-1 py-0.5 rounded bg-accent/10 text-accent font-bold">{s.admiraltySource}</span>
              <span className="text-text-secondary truncate">{s.feedName}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-text-muted italic" data-testid="corroboration-narrative">{corroboration.narrative}</p>
    </section>
  )
}

// ── Severity Votes Section ───────────────────────────────────

export function SeverityVotesSection({ iocId }: { iocId: string | null }) {
  const { data: severityVotes } = useSeverityVotes(iocId)
  if (!severityVotes || severityVotes.totalVotes === 0) return null

  return (
    <section data-testid="severity-votes-section">
      <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
        <Vote size={14} /> Severity Votes
      </h3>
      <div className="flex items-center gap-2 mb-2">
        <SeverityBadge severity={severityVotes.currentSeverity} />
        <span className="text-xs text-text-muted" data-testid="consensus-label">
          {severityVotes.margin > 10 ? 'Clear consensus' : severityVotes.margin < 5 ? 'Contested' : 'Moderate consensus'}
        </span>
      </div>
      <div className="w-full h-4 rounded-full bg-bg-elevated overflow-hidden flex mb-2" data-testid="vote-bar">
        {Object.entries(severityVotes.voteBreakdown).map(([sev, b]) => {
          const totalWeight = Object.values(severityVotes.voteBreakdown).reduce((s, v) => s + v.weight, 0)
          const pct = totalWeight > 0 ? (b.weight / totalWeight * 100) : 0
          const colors: Record<string, string> = {
            critical: 'bg-sev-critical', high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low', info: 'bg-text-muted',
          }
          return pct > 0 ? (
            <div
              key={sev}
              className={cn('h-full', colors[sev] ?? 'bg-text-muted')}
              style={{ width: `${pct}%` }}
              title={`${b.voterCount} feed(s) voted ${sev} (weight: ${b.weight})`}
            />
          ) : null
        })}
      </div>
      <div className="text-xs text-text-muted">
        {Object.entries(severityVotes.voteBreakdown).map(([sev, b]) => (
          <span key={sev} className="mr-3">{sev}: {b.weight}w ({b.voterCount})</span>
        ))}
      </div>
    </section>
  )
}

// ── Community FP Section ─────────────────────────────────────

export function CommunityFpSection({ iocId }: { iocId: string | null }) {
  const { data: fpSummary } = useFpSummary(iocId)
  const { reportFp, withdrawFp, isReporting } = useFpActions(iocId)
  const [showFpForm, setShowFpForm] = useState(false)
  const [fpReason, setFpReason] = useState('benign_service')
  const [fpNotes, setFpNotes] = useState('')

  return (
    <section data-testid="fp-section">
      <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
        <Flag size={14} /> Community False Positive
      </h3>
      {fpSummary ? (
        <>
          <div className="flex gap-4 text-sm mb-2">
            <div><span className="text-text-muted">FP Rate:</span> <span className="font-bold">{fpSummary.fpRate}%</span></div>
            <div><span className="text-text-muted">Reports:</span> <span className="font-bold">{fpSummary.fpCount}</span></div>
          </div>

          {fpSummary.autoAction === 'marked_fp' && (
            <div className="p-2 rounded bg-sev-high/10 border border-sev-high/20 text-xs text-sev-high mb-2" data-testid="fp-auto-banner">
              Marked false positive: &gt;75% of tenants reported false positive
            </div>
          )}
          {fpSummary.autoAction === 'downgraded' && (
            <div className="p-2 rounded bg-amber-400/10 border border-amber-400/20 text-xs text-amber-400 mb-2" data-testid="fp-auto-banner">
              Auto-downgraded: &gt;50% of tenants reported false positive
            </div>
          )}

          {fpSummary.reports.some(r => r.tenantId === 'current') ? (
            <button
              data-testid="withdraw-fp"
              className="text-xs px-3 py-1.5 rounded bg-sev-high/10 text-sev-high hover:bg-sev-high/20"
              onClick={() => withdrawFp()}
            >
              Withdraw FP Report
            </button>
          ) : (
            <>
              {!showFpForm ? (
                <button
                  data-testid="report-fp-btn"
                  className="text-xs px-3 py-1.5 rounded bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                  onClick={() => setShowFpForm(true)}
                >
                  Report False Positive
                </button>
              ) : (
                <div className="space-y-2 p-2 rounded border border-border bg-bg-elevated/50">
                  <select
                    data-testid="fp-reason"
                    className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-text-primary"
                    value={fpReason}
                    onChange={e => setFpReason(e.target.value)}
                  >
                    <option value="benign_service">Benign Service</option>
                    <option value="internal_infra">Internal Infrastructure</option>
                    <option value="test_data">Test Data</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea
                    data-testid="fp-notes"
                    className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-text-primary min-h-[40px] resize-y"
                    placeholder="Optional notes..."
                    value={fpNotes}
                    onChange={e => setFpNotes(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      data-testid="submit-fp"
                      className="text-xs px-2 py-1 rounded bg-amber-400/10 text-amber-400 disabled:opacity-50"
                      disabled={isReporting}
                      onClick={() => { reportFp({ reason: fpReason, notes: fpNotes || undefined }); setShowFpForm(false) }}
                    >
                      {isReporting ? 'Submitting...' : 'Submit Report'}
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-bg-elevated text-text-muted"
                      onClick={() => setShowFpForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {fpSummary.reports.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-text-muted cursor-pointer">View {fpSummary.reports.length} report(s)</summary>
              <div className="mt-1 space-y-1">
                {fpSummary.reports.map((r, i) => (
                  <div key={i} className="text-xs text-text-secondary flex gap-2">
                    <span className="text-text-muted">{r.reason}</span>
                    <span>{new Date(r.reportedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="text-xs text-text-muted italic">No FP data available</p>
      )}
    </section>
  )
}
