
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../primitives/tooltip'
interface TooltipHelpProps { message: string; size?: 3 | 4; placement?: 'top'|'bottom'|'left'|'right' }
export function TooltipHelp({ message, size = 3, placement = 'top' }: TooltipHelpProps) {
  return (
    <Tooltip placement={placement}>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors" aria-label="Help">
          <HelpCircle className={size === 3 ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  )
}
