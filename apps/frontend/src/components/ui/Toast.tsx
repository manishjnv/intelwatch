/**
 * @module components/ui/Toast
 * @description Minimal toast notification system using useSyncExternalStore.
 * No external dependencies — just React 18 + Tailwind.
 */
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'

interface ToastItem { id: number; message: string; type: 'success' | 'error' | 'info' }

let nextId = 0
let items: ToastItem[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function toast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const id = ++nextId
  items = [...items, { id, message, type }]
  emit()
  setTimeout(() => { items = items.filter(t => t.id !== id); emit() }, 3000)
}

const ICONS = { success: CheckCircle, error: AlertTriangle, info: Info }
const COLORS: Record<string, string> = {
  success: 'border-sev-low/30 bg-sev-low/5',
  error: 'border-sev-critical/30 bg-sev-critical/5',
  info: 'border-accent/30 bg-accent/5',
}
const ICON_COLORS: Record<string, string> = {
  success: 'text-sev-low', error: 'text-sev-critical', info: 'text-accent',
}

export function ToastContainer() {
  const toasts = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => items,
  )
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => {
        const Icon = ICONS[t.type]
        return (
          <div key={t.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg text-xs',
              'bg-bg-primary', COLORS[t.type],
            )}>
            <Icon className={cn('w-3.5 h-3.5 shrink-0', ICON_COLORS[t.type])} />
            <span className="text-text-primary">{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
