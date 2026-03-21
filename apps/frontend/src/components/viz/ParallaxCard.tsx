/**
 * @module components/viz/ParallaxCard
 * @description Parallax wrapper — adds multi-layer mouse-tracking parallax
 * around children (typically IntelCard). Does NOT modify IntelCard. P2-13.
 */
import { useRef, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

interface ParallaxCardProps {
  children: React.ReactNode
  className?: string
  depth?: number
}

export function ParallaxCard({ children, className, depth = 15 }: ParallaxCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ bg: '', fg: '' })

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5

      setTransform({
        bg: `translate(${x * -depth * 0.3}px, ${y * -depth * 0.3}px)`,
        fg: `translate(${x * depth * 0.15}px, ${y * depth * 0.15}px)`,
      })
    },
    [depth],
  )

  const handleMouseLeave = useCallback(() => {
    setTransform({ bg: 'translate(0,0)', fg: 'translate(0,0)' })
  }, [])

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      data-testid="parallax-card"
    >
      {/* Background parallax layer — decorative dots */}
      <div
        className="absolute inset-0 bg-grid-overlay opacity-[0.03] rounded-lg pointer-events-none transition-transform duration-100 ease-out"
        style={{ transform: transform.bg }}
        data-testid="parallax-bg"
      />

      {/* Foreground content layer */}
      <div
        className="relative transition-transform duration-100 ease-out"
        style={{ transform: transform.fg }}
        data-testid="parallax-fg"
      >
        {children}
      </div>
    </div>
  )
}
