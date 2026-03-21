/**
 * @module components/viz/AmbientBackground
 * @description Dynamic ambient background — grid pulse + accent color shift
 * based on threat level. Enhances existing .bg-grid-overlay. P2-15.
 */
import { cn } from '@/lib/utils'

type ThreatLevel = 'normal' | 'elevated' | 'high' | 'critical'

interface AmbientBackgroundProps {
  threatLevel: ThreatLevel
}

const PULSE_SPEED: Record<ThreatLevel, string> = {
  normal: 'animate-[ambient-pulse_6s_ease-in-out_infinite]',
  elevated: 'animate-[ambient-pulse_4s_ease-in-out_infinite]',
  high: 'animate-[ambient-pulse_2.5s_ease-in-out_infinite]',
  critical: 'animate-[ambient-pulse_1.5s_ease-in-out_infinite]',
}

const GLOW_COLOR: Record<ThreatLevel, string> = {
  normal: 'from-accent/5 via-transparent',
  elevated: 'from-yellow-500/5 via-transparent',
  high: 'from-orange-500/8 via-transparent',
  critical: 'from-red-500/10 via-transparent',
}

export function AmbientBackground({ threatLevel }: AmbientBackgroundProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-0" data-testid="ambient-background" data-threat-level={threatLevel}>
      {/* Grid pattern layer */}
      <div className={cn(
        'absolute inset-0 bg-grid-overlay opacity-[0.06]',
        PULSE_SPEED[threatLevel],
      )} />

      {/* Radial glow layer */}
      <div className={cn(
        'absolute inset-0 bg-radial-gradient',
        'bg-gradient-radial',
        GLOW_COLOR[threatLevel],
      )} />

      {/* Corner accents for elevated+ */}
      {threatLevel !== 'normal' && (
        <>
          <div className={cn(
            'absolute top-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20',
            threatLevel === 'critical' ? 'bg-sev-critical/20' : threatLevel === 'high' ? 'bg-sev-high/15' : 'bg-sev-medium/10',
          )} />
          <div className={cn(
            'absolute bottom-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-15',
            threatLevel === 'critical' ? 'bg-sev-critical/15' : threatLevel === 'high' ? 'bg-sev-high/10' : 'bg-sev-medium/8',
          )} />
        </>
      )}
    </div>
  )
}
