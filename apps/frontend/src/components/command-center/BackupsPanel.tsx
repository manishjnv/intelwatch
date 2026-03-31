/**
 * @module components/command-center/BackupsPanel
 * @description Backups sub-tab for System tab — backup schedule, history, restore.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, Database, Download, Upload } from 'lucide-react'

// Demo backup data
const DEMO_BACKUPS = [
  { id: 'b1', date: '2026-03-28T02:00:00Z', type: 'auto' as const, sizeMb: 245, status: 'completed' as const },
  { id: 'b2', date: '2026-03-27T02:00:00Z', type: 'auto' as const, sizeMb: 238, status: 'completed' as const },
  { id: 'b3', date: '2026-03-26T14:30:00Z', type: 'manual' as const, sizeMb: 240, status: 'completed' as const },
  { id: 'b4', date: '2026-03-26T02:00:00Z', type: 'auto' as const, sizeMb: 235, status: 'completed' as const },
  { id: 'b5', date: '2026-03-25T02:00:00Z', type: 'auto' as const, sizeMb: 230, status: 'completed' as const },
]

export function BackupsPanel() {
  const [backups] = useState(DEMO_BACKUPS)
  const [triggerPending, setTriggerPending] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  const handleTriggerBackup = () => {
    setTriggerPending(true)
    setTimeout(() => setTriggerPending(false), 2000)
  }

  return (
    <div className="space-y-4" data-testid="backups-subtab">
      {/* Backup schedule info */}
      <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border">
        <div>
          <p className="text-xs font-medium text-text-primary">Auto Backup Schedule</p>
          <p className="text-[10px] text-text-muted">Daily at 02:00 UTC · Last: {new Date(backups[0]?.date ?? '').toLocaleString()}</p>
        </div>
        <button
          onClick={handleTriggerBackup}
          disabled={triggerPending}
          className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-md hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1"
          data-testid="trigger-backup-btn"
        >
          <Database className="w-3 h-3" /> {triggerPending ? 'Creating...' : 'Backup Now'}
        </button>
      </div>

      {/* Backup table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="backup-table">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Type</th>
              <th className="text-right py-2 px-2 font-medium">Size</th>
              <th className="text-left py-2 px-2 font-medium">Status</th>
              <th className="text-right py-2 px-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id} className="border-b border-border/50">
                <td className="py-1.5 px-2 text-text-primary">{new Date(b.date).toLocaleString()}</td>
                <td className="py-1.5 px-2">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    b.type === 'auto' ? 'bg-accent/10 text-accent' : 'bg-purple-400/10 text-purple-400',
                  )}>
                    {b.type}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 text-text-muted">{b.sizeMb} MB</td>
                <td className="py-1.5 px-2">
                  <span className="text-sev-low flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {b.status}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2">
                  <div className="flex items-center justify-end gap-2">
                    <button className="text-text-muted hover:text-accent" title="Download">
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setConfirmRestore(b.id)}
                      className="text-text-muted hover:text-amber-400"
                      title="Restore"
                    >
                      <Upload className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Restore confirmation modal */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="restore-confirm-modal">
          <div className="bg-bg-primary border border-border rounded-lg p-4 max-w-sm w-full mx-4 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Confirm Restore</h3>
            <p className="text-xs text-text-secondary">
              This will restore the database to the selected backup point. Current data will be overwritten.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-3 py-1.5 text-xs bg-sev-critical text-white rounded hover:bg-sev-critical/80"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
