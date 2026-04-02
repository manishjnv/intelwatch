/**
 * @module components/viz/SeverityHeatmap
 * @description 3D severity heatmap grid — IOC type x severity cross-tab with
 * Framer Motion tilt per cell. Color intensity = count. P0-2.
 */
import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useIOCStats } from '@/hooks/use-intel-data'
import { cn } from '@/lib/utils'

const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const
const IOC_TYPES = ['ip', 'domain', 'url', 'hash_sha256', 'cve', 'email'] as const

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'rgba(239,68,68,VAR)',
  high: 'rgba(249,115,22,VAR)',
  medium: 'rgba(234,179,8,VAR)',
  low: 'rgba(34,197,94,VAR)',
  info: 'rgba(100,116,139,VAR)',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW', info: 'INFO',
}

const TYPE_LABEL: Record<string, string> = {
  ip: 'IP', domain: 'Domain', url: 'URL', hash_sha256: 'Hash', cve: 'CVE', email: 'Email',
}

interface CellData {
  type: string
  severity: string
  count: number
  intensity: number // 0-1
}

function buildHeatmapData(stats: { bySeverity?: Record<string, number>; byType?: Record<string, number> } | undefined): CellData[] {
  if (!stats?.bySeverity || !stats?.byType) return []
  const total = Object.values(stats.bySeverity).reduce((a, b) => a + b, 0) || 1
  const cells: CellData[] = []

  for (const type of IOC_TYPES) {
    const typeCount = stats.byType[type] ?? 0
    for (const sev of SEVERITY_LEVELS) {
      const sevCount = stats.bySeverity[sev] ?? 0
      // Distribute proportionally (approximate cross-tab from marginals)
      const estimated = total > 0 ? Math.round((typeCount * sevCount) / total) : 0
      const maxCount = Math.max(...Object.values(stats.bySeverity), 1)
      cells.push({
        type,
        severity: sev,
        count: estimated,
        intensity: Math.min(estimated / maxCount, 1),
      })
    }
  }
  return cells
}

function getCellBg(severity: string, intensity: number): string {
  const alpha = (0.1 + intensity * 0.6).toFixed(2)
  return (SEVERITY_COLOR[severity] ?? 'rgba(100,116,139,VAR)').replace('VAR', alpha)
}

/** IOC types that are more relevant when a profile is set (based on common org attack surfaces) */
const PROFILE_RELEVANT_TYPES: Record<string, string[]> = {
  Finance: ['ip', 'domain', 'email'],
  Healthcare: ['ip', 'domain', 'cve'],
  Government: ['ip', 'domain', 'hash_sha256'],
  Energy: ['ip', 'cve', 'domain'],
  Telecom: ['ip', 'domain', 'url'],
  Technology: ['domain', 'hash_sha256', 'cve'],
  Retail: ['url', 'domain', 'email'],
  Manufacturing: ['ip', 'cve', 'domain'],
  Education: ['email', 'domain', 'url'],
  Defense: ['ip', 'hash_sha256', 'domain'],
}

interface SeverityHeatmapProps {
  className?: string
  /** When set, highlights cells for IOC types relevant to the org profile industry */
  profile?: { industry: string } | null
}

export function SeverityHeatmap({ className, profile }: SeverityHeatmapProps) {
  const { data: stats } = useIOCStats()
  const cells = useMemo(() => buildHeatmapData(stats), [stats])
  const relevantTypes = useMemo(() => {
    if (!profile?.industry) return new Set<string>()
    return new Set(PROFILE_RELEVANT_TYPES[profile.industry] ?? [])
  }, [profile])

  if (cells.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-bg-secondary/30 p-4', className)}>
        <p className="text-xs text-text-muted text-center">No IOC data for heatmap</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border bg-bg-secondary/30 p-4', className)} data-testid="severity-heatmap">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          IOC Severity Distribution
        </h3>
        {relevantTypes.size > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent" data-testid="heatmap-profile-hint">
            Profile highlighted
          </span>
        )}
      </div>

      {/* Header row */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${SEVERITY_LEVELS.length}, 1fr)` }}>
        <div />
        {SEVERITY_LEVELS.map(sev => (
          <div key={sev} className="text-center text-[10px] font-medium text-text-muted uppercase pb-1">
            {SEVERITY_LABEL[sev]}
          </div>
        ))}

        {/* Data rows */}
        {IOC_TYPES.map(type => (
          <React.Fragment key={type}>
            <div className="text-[11px] text-text-secondary font-medium flex items-center">
              {TYPE_LABEL[type]}
            </div>
            {SEVERITY_LEVELS.map(sev => {
              const cell = cells.find(c => c.type === type && c.severity === sev)
              const isRelevant = relevantTypes.has(type)
              return (
                <motion.div
                  key={`${type}-${sev}`}
                  className={cn(
                    'rounded-md flex items-center justify-center h-9 text-[10px] font-mono tabular-nums cursor-default border',
                    isRelevant ? 'border-accent/40 ring-1 ring-accent/20' : 'border-transparent',
                  )}
                  style={{
                    backgroundColor: getCellBg(sev, cell?.intensity ?? 0),
                    transformStyle: 'preserve-3d',
                  }}
                  whileHover={{
                    rotateX: -3,
                    rotateY: 3,
                    scale: 1.08,
                    borderColor: 'var(--border-strong)',
                    transition: { duration: 0.15 },
                  }}
                  title={`${TYPE_LABEL[type]} / ${sev}: ${cell?.count ?? 0}`}
                  data-testid={`heatmap-cell-${type}-${sev}`}
                >
                  <span className="text-text-primary/80">{cell?.count ?? 0}</span>
                </motion.div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
