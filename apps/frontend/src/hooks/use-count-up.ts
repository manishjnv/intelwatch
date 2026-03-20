import { useState, useEffect, useRef } from 'react'

/**
 * Animate a number from 0 to the target value with ease-out.
 * Returns the current animated value.
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (target <= 0) { setValue(0); return }

    const start = performance.now()
    startRef.current = start

    function tick(now: number) {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out quadratic
      const eased = 1 - (1 - progress) * (1 - progress)
      setValue(Math.round(eased * target))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}
