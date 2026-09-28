/**
 * @module widgets/AttackTechniqueWidget
 * @description MITRE ATT&CK tactic breakdown. No real ATT&CK mapping is
 * wired to IOCs yet — renders an honest empty state until one exists.
 */
import { useNavigate } from 'react-router-dom'
import { Crosshair, ArrowRight } from 'lucide-react'

export function AttackTechniqueWidget() {
  const navigate = useNavigate()

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
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <p className="text-[10px] text-text-muted py-2">ATT&CK mapping not available yet</p>
    </div>
  )
}
