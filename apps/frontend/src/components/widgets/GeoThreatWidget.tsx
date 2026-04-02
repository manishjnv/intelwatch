/**
 * @module components/widgets/GeoThreatWidget
 * Geographic threat distribution — country horizontal bar chart.
 * Derives country data from topActors (demo mapping) and highlights
 * countries matching the org profile geography.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { cn } from '@/lib/utils'
import type { OrgProfile } from '@/types/org-profile'
import { ArrowRight, Globe } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Country flag emoji helper                                           */
/* ------------------------------------------------------------------ */
const COUNTRY_FLAGS: Record<string, string> = {
  'China': '\u{1F1E8}\u{1F1F3}', 'Russia': '\u{1F1F7}\u{1F1FA}',
  'United States': '\u{1F1FA}\u{1F1F8}', 'Iran': '\u{1F1EE}\u{1F1F7}',
  'North Korea': '\u{1F1F0}\u{1F1F5}', 'India': '\u{1F1EE}\u{1F1F3}',
  'Brazil': '\u{1F1E7}\u{1F1F7}', 'Vietnam': '\u{1F1FB}\u{1F1F3}',
  'Nigeria': '\u{1F1F3}\u{1F1EC}', 'Ukraine': '\u{1F1FA}\u{1F1E6}',
  'Pakistan': '\u{1F1F5}\u{1F1F0}', 'Turkey': '\u{1F1F9}\u{1F1F7}',
}

/* ------------------------------------------------------------------ */
/* Demo geo distribution — maps actor activity to country IOC counts   */
/* ------------------------------------------------------------------ */
const DEMO_GEO_DATA: { country: string; iocCount: number }[] = [
  { country: 'China', iocCount: 342 },
  { country: 'Russia', iocCount: 289 },
  { country: 'United States', iocCount: 215 },
  { country: 'Iran', iocCount: 178 },
  { country: 'North Korea', iocCount: 134 },
  { country: 'India', iocCount: 98 },
  { country: 'Brazil', iocCount: 76 },
  { country: 'Vietnam', iocCount: 54 },
  { country: 'Nigeria', iocCount: 41 },
  { country: 'Ukraine', iocCount: 37 },
]

/** Geographic threat distribution widget. */
export function GeoThreatWidget({ profile }: { profile: OrgProfile | null }) {
  const navigate = useNavigate()
  const { topActors, isDemo } = useAnalyticsDashboard()

  const countries = useMemo(() => {
    // Scale demo data proportionally to total actor IOC count
    const totalActorIocs = topActors.reduce((s, a) => s + a.iocCount, 0)
    const scale = totalActorIocs > 0 ? totalActorIocs / 1464 : 1 // 1464 = sum of demo counts
    return DEMO_GEO_DATA.map(g => ({
      ...g,
      iocCount: Math.round(g.iocCount * scale) || g.iocCount,
    })).slice(0, 8)
  }, [topActors])

  if (countries.length === 0) return null

  const maxCount = Math.max(...countries.map(c => c.iocCount), 1)
  const profileCountry = profile?.geography?.country ?? ''

  return (
    <div
      data-testid="geo-threat-widget"
      onClick={() => navigate('/threat-actors')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-medium text-text-primary">Geo Threat Map</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <div className="space-y-1.5">
        {countries.map(c => {
          const isHighlighted = profileCountry.toLowerCase() === c.country.toLowerCase()
          return (
            <div
              key={c.country}
              data-testid={`geo-row-${c.country.replace(/\s/g, '-').toLowerCase()}`}
              className={cn(
                'flex items-center gap-2',
                isHighlighted && 'ring-1 ring-accent/40 rounded px-1 -mx-1',
              )}
            >
              <span className="text-xs shrink-0 w-4" aria-label={c.country}>
                {COUNTRY_FLAGS[c.country] ?? '\u{1F3F3}\u{FE0F}'}
              </span>
              <span className="text-xs text-text-secondary truncate w-20 shrink-0">
                {c.country}
              </span>
              <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    isHighlighted ? 'bg-accent/70' : 'bg-teal-400/60',
                  )}
                  style={{ width: `${(c.iocCount / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-text-muted w-8 text-right shrink-0">
                {c.iocCount}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
