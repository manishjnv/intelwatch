/**
 * @module components/SkeletonBlock
 * @description Reusable skeleton loading placeholder.
 * Design principle #4: "Skeleton screens on all loading states; never spinners alone."
 * NOT design-locked — shape is free; the mandate is: always use skeletons.
 */
interface SkeletonBlockProps {
  /** Number of rows */
  rows?: number
  /** Width pattern for rows. E.g. ['100%', '80%', '60%'] */
  widths?: string[]
  /** Row height (Tailwind class). Default 'h-3' */
  height?: string
  /** Additional className */
  className?: string
}

/**
 * Skeleton placeholder for loading states.
 *
 * @example
 * // Default 3-row skeleton
 * <SkeletonBlock />
 *
 * // Custom widths
 * <SkeletonBlock rows={2} widths={['100%', '60%']} />
 */
export function SkeletonBlock({
  rows = 3,
  widths = ['100%', '80%', '60%'],
  height = 'h-3',
  className = '',
}: SkeletonBlockProps) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={`${height} bg-[var(--bg-hover)] rounded`}
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  )
}
