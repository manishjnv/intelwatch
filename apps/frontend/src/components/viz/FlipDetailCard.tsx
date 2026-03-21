/**
 * @module components/viz/FlipDetailCard
 * @description 3D flip card — rotateY 180° to reveal detail on back face.
 * Framer Motion AnimatePresence. P1-6.
 */
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FlipDetailCardProps {
  isFlipped: boolean
  front: React.ReactNode
  back: React.ReactNode
  className?: string
}

const flipTransition = { duration: 0.5, ease: [0.4, 0, 0.2, 1] }

export function FlipDetailCard({ isFlipped, front, back, className }: FlipDetailCardProps) {
  return (
    <div
      className={cn('relative w-full h-full', className)}
      style={{ perspective: 1200 }}
      data-testid="flip-card"
    >
      {/* Front face */}
      <motion.div
        className="absolute inset-0 rounded-lg border border-border bg-bg-secondary overflow-auto"
        style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={flipTransition}
        data-testid="flip-card-front"
      >
        {front}
      </motion.div>

      {/* Back face */}
      <motion.div
        className="absolute inset-0 rounded-lg border border-accent/30 bg-bg-elevated overflow-auto"
        style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
        initial={{ rotateY: -180 }}
        animate={{ rotateY: isFlipped ? 0 : -180 }}
        transition={flipTransition}
        data-testid="flip-card-back"
      >
        {back}
      </motion.div>
    </div>
  )
}

/** IOC summary shown on the front of a flip card */
export function IOCSummaryFront({ record }: { record: { normalizedValue: string; iocType: string; severity: string; confidence: number; tags: string[] } }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary truncate">{record.normalizedValue}</span>
        <span className="text-[10px] uppercase font-mono text-text-muted">{record.iocType}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded-full font-medium',
          record.severity === 'critical' && 'bg-sev-critical/20 text-red-300',
          record.severity === 'high' && 'bg-sev-high/20 text-orange-300',
          record.severity === 'medium' && 'bg-sev-medium/20 text-yellow-300',
          record.severity === 'low' && 'bg-sev-low/20 text-green-300',
        )}>
          {record.severity}
        </span>
        <span className="text-xs text-text-muted tabular-nums">Conf: {record.confidence}%</span>
      </div>
      {record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {record.tags.slice(0, 5).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">{t}</span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-text-muted">Click to flip for details</p>
    </div>
  )
}

/** Detail view on the back of a flip card */
export function IOCDetailBack({ record, onFlipBack }: { record: { normalizedValue: string; iocType: string; severity: string; confidence: number; firstSeen: string | null; lastSeen: string | null; tlp: string; lifecycle: string; threatActors: string[]; malwareFamilies: string[] }; onFlipBack: () => void }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">IOC Detail</h4>
        <button onClick={onFlipBack} className="text-[10px] text-accent hover:underline">
          ← Back
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-text-muted">Type:</span> <span className="text-text-primary uppercase font-mono">{record.iocType}</span></div>
        <div><span className="text-text-muted">TLP:</span> <span className="text-text-primary uppercase">{record.tlp}</span></div>
        <div><span className="text-text-muted">Status:</span> <span className="text-text-primary">{record.lifecycle}</span></div>
        <div><span className="text-text-muted">Confidence:</span> <span className="text-text-primary tabular-nums">{record.confidence}%</span></div>
        <div><span className="text-text-muted">First Seen:</span> <span className="text-text-primary">{record.firstSeen ?? '—'}</span></div>
        <div><span className="text-text-muted">Last Seen:</span> <span className="text-text-primary">{record.lastSeen ?? '—'}</span></div>
      </div>
      {record.threatActors.length > 0 && (
        <div>
          <span className="text-[10px] text-text-muted uppercase">Threat Actors</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {record.threatActors.map(a => (
              <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">{a}</span>
            ))}
          </div>
        </div>
      )}
      {record.malwareFamilies.length > 0 && (
        <div>
          <span className="text-[10px] text-text-muted uppercase">Malware</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {record.malwareFamilies.map(m => (
              <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-300">{m}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
