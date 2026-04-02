/**
 * @module widgets/AttackTechniqueWidget
 * @description Top 8 MITRE ATT&CK tactic categories with count bubbles.
 * Uses demo data since real ATT&CK tagging is not yet wired to IOCs.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crosshair, ArrowRight } from 'lucide-react'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'

/* ── MITRE ATT&CK Tactics ───────────────────────────────────────── */

interface Tactic {
  id: string
  name: string
  short: string
  color: string
  weight: number  // distribution weight for demo data
}

const TACTICS: Tactic[] = [
  { id: 'TA0001', name: 'Initial Access',        short: 'Init Access',  color: 'bg-red-500/15 text-red-300 border-red-500/20',       weight: 0.18 },
  { id: 'TA0002', name: 'Execution',             short: 'Execution',    color: 'bg-orange-500/15 text-orange-300 border-orange-500/20', weight: 0.15 },
  { id: 'TA0003', name: 'Persistence',           short: 'Persistence',  color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20', weight: 0.14 },
  { id: 'TA0004', name: 'Privilege Escalation',  short: 'Priv Esc',    color: 'bg-amber-500/15 text-amber-300 border-amber-500/20',   weight: 0.10 },
  { id: 'TA0005', name: 'Defense Evasion',       short: 'Def Evasion', color: 'bg-purple-500/15 text-purple-300 border-purple-500/20', weight: 0.13 },
  { id: 'TA0006', name: 'Credential Access',     short: 'Cred Access', color: 'bg-pink-500/15 text-pink-300 border-pink-500/20',     weight: 0.12 },
  { id: 'TA0007', name: 'Discovery',             short: 'Discovery',   color: 'bg-blue-500/15 text-blue-300 border-blue-500/20',     weight: 0.10 },
  { id: 'TA0008', name: 'Lateral Movement',      short: 'Lateral Mvt', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',     weight: 0.08 },
]

/* ── Component ──────────────────────────────────────────────────── */

export function AttackTechniqueWidget() {
  const navigate = useNavigate()
  const { topIocs, isDemo } = useAnalyticsDashboard()

  // Derive counts proportionally from topIocs total (demo heuristic)
  const tactics = useMemo(() => {
    const baseCount = Math.max(topIocs.length * 8, 40) // Scale factor
    return TACTICS.map(t => ({
      ...t,
      count: Math.max(1, Math.round(baseCount * t.weight)),
    }))
  }, [topIocs])

  return (
    <div
      data-testid="attack-technique-widget"
      onClick={() => navigate('/threat-actors')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-medium text-text-primary">ATT&CK Tactics</span>
        <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">
          {isDemo ? 'Demo' : 'Beta'}
        </span>
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {/* 4x2 tactic grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {tactics.map(t => (
          <div
            key={t.id}
            className={`flex items-center justify-between px-2 py-1 rounded border text-[10px] ${t.color}`}
          >
            <span className="truncate">{t.short}</span>
            <span className="font-bold tabular-nums ml-1 shrink-0">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
