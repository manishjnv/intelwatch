/**
 * @module components/widgets/GeoThreatWidget
 * Geographic threat attribution widget. No real per-country IOC source
 * exists yet — renders an honest empty state until one is wired up.
 */
import { useNavigate } from 'react-router-dom'
import type { OrgProfile } from '@/types/org-profile'
import { ArrowRight, Globe } from 'lucide-react'

export function GeoThreatWidget({ profile: _profile }: { profile: OrgProfile | null }) {
  const navigate = useNavigate()

  return (
    <div
      data-testid="geo-threat-widget"
      onClick={() => navigate('/threat-actors')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors sm:col-span-2"
    >
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-medium text-text-primary">Geo Threat Map</span>
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <p className="text-[10px] text-text-muted py-2">Geographic attribution not available yet</p>
    </div>
  )
}
