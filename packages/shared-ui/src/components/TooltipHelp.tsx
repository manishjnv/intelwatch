/**
 * @module components/TooltipHelp
 * @description Hover tooltip triggered by a "?" icon.
 * 20-UI-UX mandate: "Every feature has a tooltip + inline help."
 * NOT design-locked — free to style; behaviour is fixed.
 */
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../primitives/tooltip'

interface TooltipHelpProps {
  /** The help text shown on hover */
  message: string
  /** Icon size — defaults to 3 (w-3 h-3) */
  size?: 3 | 4
  /** Optional placement override */
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * A small "?" icon that shows a tooltip on hover/focus.
 *
 * @example
 * <label>Confidence score <TooltipHelp message="0–100 score based on source reliability and corroboration." /></label>
 */
export function TooltipHelp({ message, size = 3, placement = 'top' }: TooltipHelpProps) {
  const sizeClass = size === 3 ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <Tooltip placement={placement}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          aria-label="Help"
        >
          <HelpCircle className={`${sizeClass} shrink-0`} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  )
}
