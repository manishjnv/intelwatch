/**
 * @module components/ioc/RiskPropagationBanner
 * @description Animated banner showing retroactive risk propagation events.
 * Appears when correlation service has propagated risk to this IOC (DECISION-020).
 */
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, X } from 'lucide-react'
import type { IOCTimelineEvent } from '@/hooks/use-intel-data'

interface RiskPropagationBannerProps {
  timelineEvents: IOCTimelineEvent[]
  className?: string
}

export function RiskPropagationBanner({ timelineEvents, className }: RiskPropagationBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const correlationEvents = useMemo(
    () => timelineEvents.filter(e => e.eventType === 'correlation'),
    [timelineEvents],
  )

  if (!correlationEvents.length || dismissed) return null

  const latest = correlationEvents[correlationEvents.length - 1]!

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`overflow-hidden ${className ?? ''}`}
        data-testid="risk-propagation-banner"
      >
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-amber-300 font-medium">Risk Propagation</span>
            <p className="text-text-secondary mt-0.5 leading-relaxed" data-testid="propagation-summary">
              {latest.summary}
            </p>
            {latest.source && (
              <span className="text-text-muted mt-0.5 block">
                Source: {latest.source} &middot; {new Date(latest.timestamp).toLocaleDateString()}
              </span>
            )}
            {correlationEvents.length > 1 && (
              <span className="text-text-muted mt-0.5 block">
                +{correlationEvents.length - 1} more propagation event{correlationEvents.length > 2 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-0.5 rounded hover:bg-amber-500/10 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Dismiss"
            data-testid="dismiss-propagation"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
