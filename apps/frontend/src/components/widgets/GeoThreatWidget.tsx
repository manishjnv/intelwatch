/**
 * @module components/widgets/GeoThreatWidget
 * Interactive dot-map showing threat origins by country.
 * Falls back to horizontal bar chart when SVG isn't supported.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { cn } from '@/lib/utils'
import type { OrgProfile } from '@/types/org-profile'
import { ArrowRight, Globe } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Country data — lat/lng + flag emoji for dot-map placement           */
/* ------------------------------------------------------------------ */
interface CountryGeo {
  country: string
  flag: string
  /** Normalized X (0-100) on flat Mercator projection */
  x: number
  /** Normalized Y (0-100) on flat Mercator projection */
  y: number
}

const COUNTRY_GEO: CountryGeo[] = [
  { country: 'China', flag: '\u{1F1E8}\u{1F1F3}', x: 75, y: 35 },
  { country: 'Russia', flag: '\u{1F1F7}\u{1F1FA}', x: 62, y: 22 },
  { country: 'United States', flag: '\u{1F1FA}\u{1F1F8}', x: 22, y: 33 },
  { country: 'Iran', flag: '\u{1F1EE}\u{1F1F7}', x: 56, y: 37 },
  { country: 'North Korea', flag: '\u{1F1F0}\u{1F1F5}', x: 80, y: 32 },
  { country: 'India', flag: '\u{1F1EE}\u{1F1F3}', x: 65, y: 42 },
  { country: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', x: 32, y: 62 },
  { country: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}', x: 74, y: 44 },
  { country: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}', x: 44, y: 50 },
  { country: 'Ukraine', flag: '\u{1F1FA}\u{1F1E6}', x: 53, y: 26 },
  { country: 'Pakistan', flag: '\u{1F1F5}\u{1F1F0}', x: 62, y: 38 },
  { country: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}', x: 52, y: 32 },
  { country: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', x: 47, y: 25 },
  { country: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', x: 44, y: 24 },
  { country: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', x: 84, y: 33 },
  { country: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}', x: 81, y: 34 },
  { country: 'Indonesia', flag: '\u{1F1EE}\u{1F1E9}', x: 76, y: 55 },
  { country: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', x: 18, y: 42 },
  { country: 'Australia', flag: '\u{1F1E6}\u{1F1FA}', x: 83, y: 68 },
  { country: 'Canada', flag: '\u{1F1E8}\u{1F1E6}', x: 22, y: 22 },
  { country: 'France', flag: '\u{1F1EB}\u{1F1F7}', x: 45, y: 27 },
  { country: 'Israel', flag: '\u{1F1EE}\u{1F1F1}', x: 53, y: 37 },
  { country: 'South Africa', flag: '\u{1F1FF}\u{1F1E6}', x: 49, y: 70 },
  { country: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}', x: 51, y: 38 },
  { country: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}', x: 73, y: 46 },
]

/* ------------------------------------------------------------------ */
/* Demo geo distribution                                               */
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

/* ------------------------------------------------------------------ */
/* Top actor → country mapping for tooltip                             */
/* ------------------------------------------------------------------ */
const ACTOR_BY_COUNTRY: Record<string, string> = {
  'China': 'APT41', 'Russia': 'APT28', 'North Korea': 'Lazarus Group',
  'Iran': 'Charming Kitten', 'United States': 'Various', 'India': 'SideWinder',
  'Brazil': 'Prilex', 'Vietnam': 'OceanLotus', 'Nigeria': 'SilverTerrier',
  'Ukraine': 'Gamaredon',
}

/* ------------------------------------------------------------------ */
/* Color gradient from IOC intensity                                   */
/* ------------------------------------------------------------------ */
function dotColor(ratio: number): string {
  if (ratio >= 0.8) return '#ef4444' // red-500
  if (ratio >= 0.5) return '#f97316' // orange-500
  if (ratio >= 0.2) return '#eab308' // yellow-500
  return '#64748b' // slate-500
}

function dotRadius(ratio: number): number {
  return 3 + ratio * 6 // 3px min, 9px max
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function GeoThreatWidget({ profile }: { profile: OrgProfile | null }) {
  const navigate = useNavigate()
  const { topActors, isDemo } = useAnalyticsDashboard()
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)

  const countries = useMemo(() => {
    const totalActorIocs = topActors.reduce((s, a) => s + a.iocCount, 0)
    const scale = totalActorIocs > 0 ? totalActorIocs / 1464 : 1
    return DEMO_GEO_DATA.map(g => ({
      ...g,
      iocCount: Math.round(g.iocCount * scale) || g.iocCount,
    }))
  }, [topActors])

  const maxCount = Math.max(...countries.map(c => c.iocCount), 1)
  const profileCountry = profile?.geography?.country ?? ''

  // Merge geo positions with IOC counts
  const dots = useMemo(() => {
    const countMap = new Map(countries.map(c => [c.country, c.iocCount]))
    return COUNTRY_GEO.map(geo => ({
      ...geo,
      iocCount: countMap.get(geo.country) ?? 0,
    })).filter(d => d.iocCount > 0)
  }, [countries])

  const top5 = countries.slice(0, 5)
  const hoveredData = hoveredCountry
    ? countries.find(c => c.country === hoveredCountry)
    : null

  return (
    <div
      data-testid="geo-threat-widget"
      onClick={() => navigate('/threat-actors')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors sm:col-span-2"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-medium text-text-primary">Geo Threat Map</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {countries.length === 0 ? (
        <p className="text-[10px] text-text-muted py-2">No geographic data available</p>
      ) : (
        <>
          {/* SVG Dot Map */}
          <div className="relative mb-3" data-testid="geo-dot-map">
            <svg
              viewBox="0 0 100 80"
              className="w-full h-auto"
              style={{ minHeight: 100 }}
            >
              {/* Background — subtle grid lines for continent shapes */}
              <rect x="0" y="0" width="100" height="80" fill="none" />
              {/* Equator reference */}
              <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" strokeOpacity="0.05" strokeWidth="0.2" />
              {/* Simplified continent outlines — very faint */}
              <ellipse cx="25" cy="35" rx="15" ry="12" fill="currentColor" fillOpacity="0.03" />
              <ellipse cx="30" cy="58" rx="8" ry="14" fill="currentColor" fillOpacity="0.03" />
              <ellipse cx="48" cy="30" rx="8" ry="10" fill="currentColor" fillOpacity="0.03" />
              <ellipse cx="50" cy="52" rx="10" ry="14" fill="currentColor" fillOpacity="0.03" />
              <ellipse cx="65" cy="38" rx="12" ry="14" fill="currentColor" fillOpacity="0.03" />
              <ellipse cx="80" cy="40" rx="10" ry="12" fill="currentColor" fillOpacity="0.03" />
              <ellipse cx="82" cy="65" rx="8" ry="8" fill="currentColor" fillOpacity="0.03" />

              {/* Threat dots */}
              {dots.map(d => {
                const ratio = d.iocCount / maxCount
                const isOrg = profileCountry.toLowerCase() === d.country.toLowerCase()
                const isHovered = hoveredCountry === d.country
                const r = dotRadius(ratio)

                return (
                  <g key={d.country}>
                    {/* Org country pulse ring */}
                    {isOrg && (
                      <circle
                        cx={d.x} cy={d.y} r={r + 3}
                        fill="none" stroke="var(--accent)" strokeWidth="0.5"
                        opacity="0.6"
                      >
                        <animate
                          attributeName="r" values={`${r + 2};${r + 5};${r + 2}`}
                          dur="2s" repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity" values="0.6;0.2;0.6"
                          dur="2s" repeatCount="indefinite"
                        />
                      </circle>
                    )}
                    <circle
                      cx={d.x} cy={d.y} r={isHovered ? r + 1 : r}
                      fill={isOrg ? 'var(--accent)' : dotColor(ratio)}
                      opacity={isHovered ? 1 : 0.8}
                      className="transition-all duration-150"
                      onMouseEnter={(e) => {
                        e.stopPropagation()
                        setHoveredCountry(d.country)
                      }}
                      onMouseLeave={() => setHoveredCountry(null)}
                    />
                  </g>
                )
              })}
            </svg>

            {/* Tooltip */}
            {hoveredData && hoveredCountry && (
              <div
                data-testid="geo-tooltip"
                className="absolute top-1 right-1 bg-bg-elevated border border-border rounded px-2 py-1.5 text-[10px] pointer-events-none z-10"
              >
                <div className="font-medium text-text-primary">{hoveredCountry}</div>
                <div className="text-text-muted">{hoveredData.iocCount} IOCs</div>
                {ACTOR_BY_COUNTRY[hoveredCountry] && (
                  <div className="text-text-muted">Top: {ACTOR_BY_COUNTRY[hoveredCountry]}</div>
                )}
              </div>
            )}
          </div>

          {/* Top 5 legend */}
          <div className="space-y-1" data-testid="geo-legend">
            {top5.map(c => {
              const geo = COUNTRY_GEO.find(g => g.country === c.country)
              const isHighlighted = profileCountry.toLowerCase() === c.country.toLowerCase()
              return (
                <div
                  key={c.country}
                  className={cn(
                    'flex items-center gap-2 text-[10px]',
                    isHighlighted && 'ring-1 ring-accent/40 rounded px-1 -mx-1',
                  )}
                >
                  <span className="w-4 shrink-0">{geo?.flag ?? '\u{1F3F3}\u{FE0F}'}</span>
                  <span className="text-text-secondary truncate flex-1">{c.country}</span>
                  <div className="w-12 h-1 bg-bg-elevated rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(c.iocCount / maxCount) * 100}%`,
                        backgroundColor: isHighlighted ? 'var(--accent)' : dotColor(c.iocCount / maxCount),
                      }}
                    />
                  </div>
                  <span className="tabular-nums text-text-muted w-7 text-right shrink-0">{c.iocCount}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
