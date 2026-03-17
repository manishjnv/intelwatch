
interface SkeletonBlockProps { rows?: number; widths?: string[]; height?: string; className?: string }
export function SkeletonBlock({ rows=3, widths=['100%','80%','60%'], height='h-3', className='' }: SkeletonBlockProps) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${height} bg-[var(--bg-hover)] rounded`} style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  )
}
