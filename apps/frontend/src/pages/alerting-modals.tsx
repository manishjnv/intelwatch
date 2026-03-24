/**
 * @module pages/alerting-modals
 * @description Modals and drawers for AlertingPage — extracted to keep
 * main page under 400 lines.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useAlertHistory, useCreateChannel, type ChannelType,
} from '@/hooks/use-alerting-data'
import { X, Mail, MessageSquare, Webhook } from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const CHANNEL_ICONS: Record<ChannelType, React.FC<{ className?: string }>> = {
  email: Mail,
  slack: MessageSquare,
  webhook: Webhook,
}

// ─── History Drawer ─────────────────────────────────────────────

/** Slide-in drawer showing an alert's timeline history. */
export function HistoryDrawer({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const { data: history } = useAlertHistory(alertId)
  const entries = history ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-elevated border-l border-border-subtle h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">Alert History</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-primary text-text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {entries.map(e => (
            <div key={e.id} className="flex gap-3 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              <div>
                <p className="text-text-primary font-medium">{e.action}</p>
                <p className="text-text-muted">{e.details}</p>
                <p className="text-text-muted mt-0.5">{e.performedBy} · {fmtDate(e.createdAt)}</p>
              </div>
            </div>
          ))}
          {entries.length === 0 && <p className="text-xs text-text-muted text-center py-8">No history entries.</p>}
        </div>
      </div>
    </div>
  )
}

// ─── New Channel Modal ──────────────────────────────────────────

/** Modal for creating a new notification channel (email/slack/webhook). */
export function NewChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('email')
  const [configValue, setConfigValue] = useState('')
  const createMut = useCreateChannel()

  const handleSubmit = () => {
    if (!name.trim() || !configValue.trim()) return
    const config: Record<string, unknown> = { type }
    if (type === 'email') config.email = { recipients: configValue.split(',').map(s => s.trim()) }
    else if (type === 'slack') config.slack = { webhookUrl: configValue }
    else config.webhook = { url: configValue, method: 'POST' }
    createMut.mutate({ name, type, config, enabled: true } as never, {
      onSuccess: () => { onClose(); setName(''); setConfigValue('') },
    })
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">New Notification Channel</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Channel Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SOC Team Email"
              className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none" />
          </div>
          <div>
            <label className="text-[11px] text-text-muted block mb-1">Type</label>
            <div className="flex gap-2">
              {(['email', 'slack', 'webhook'] as const).map(t => {
                const Icon = CHANNEL_ICONS[t]
                return (
                  <button key={t} onClick={() => setType(t)}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors',
                      type === t ? 'border-accent text-accent bg-accent/10' : 'border-border-subtle text-text-muted hover:text-text-secondary')}>
                    <Icon className="w-3.5 h-3.5" /> {t}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-text-muted block mb-1">
              {type === 'email' ? 'Recipients (comma-separated)' : type === 'slack' ? 'Webhook URL' : 'Endpoint URL'}
            </label>
            <input value={configValue} onChange={e => setConfigValue(e.target.value)}
              placeholder={type === 'email' ? 'soc@company.com, ops@company.com' : 'https://...'}
              className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-xs text-text-muted rounded-lg border border-border-subtle hover:border-accent/40 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={createMut.isPending || !name.trim()}
            className="px-4 py-2 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {createMut.isPending ? 'Creating…' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  )
}
