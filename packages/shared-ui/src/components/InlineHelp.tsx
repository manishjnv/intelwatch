import React from 'react'
import { Info } from 'lucide-react'
interface InlineHelpProps { message: string; className?: string }
export function InlineHelp({ message, className = '' }: InlineHelpProps) {
  return (
    <p className={`mt-1 text-xs text-[var(--text-muted)] flex items-start gap-1 ${className}`}>
      <Info className="w-3 h-3 mt-0.5 shrink-0" />{message}
    </p>
  )
}
