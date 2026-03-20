/**
 * @module components/InlineHelp
 * @description Inline hint text with info icon for contextual guidance.
 * 20-UI-UX mandate: "Every feature has a tooltip + inline help; no confusion allowed."
 * NOT design-locked — free to style.
 */
import { Info } from 'lucide-react'

interface InlineHelpProps {
  /** The help message displayed inline below a form field or section */
  message: string
  /** Optional className override */
  className?: string
}

/**
 * Inline contextual help displayed below a field or section.
 *
 * @example
 * <InlineHelp message="Enter the IOC value exactly as observed. The system auto-detects the type." />
 */
export function InlineHelp({ message, className = '' }: InlineHelpProps) {
  return (
    <p className={`mt-1 text-xs text-[var(--text-muted)] flex items-start gap-1 ${className}`}>
      <Info className="w-3 h-3 mt-0.5 shrink-0" />
      {message}
    </p>
  )
}
