/**
 * @module components/command-center/integrations/ConnectionList
 * @description Real connectors from GET /integrations. Plan-gated Add action (UI-only —
 * see PR report for the server-side gating gap), enable toggle (PUT), Test (POST
 * /:id/test), Edit (opens the wizard pre-filled), Delete (ConfirmDialog, not window.confirm).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { QueryStateView } from '@/components/ui/QueryStateView'
import { toast } from '@/components/ui/Toast'
import {
  useIntegrations, useIntegrationsHealth, useUpdateIntegration, useDeleteIntegration, useTestIntegration,
  type Integration,
} from '@/hooks/use-integrations'
import { CONNECTOR_TYPES } from './connector-types'
import { PLANS, salesMailto } from '@/data/plans'
import { Plug, Pencil, Trash2, Play, Loader2, Plus, AlertTriangle } from 'lucide-react'

/** UI-only convenience read of plans.ts feature copy — see PR report: no server-side enforcement yet. */
function siemIntegrationLimit(plan: string): number | null {
  const p = PLANS.find(x => x.id === plan || x.name.toLowerCase() === plan.toLowerCase())
  if (!p) return null // unknown plan id — don't gate on a guess
  if (p.id === 'enterprise') return null // unlimited
  const feature = p.features.find(f => /SIEM integrations?\s*\(\d+\)/i.test(f))
  const match = feature?.match(/\((\d+)\)/)
  return match ? Number(match[1]) : 0
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface ConnectionListProps {
  tenantPlan: string
  onAdd: () => void
  onEdit: (integration: Integration) => void
}

export function ConnectionList({ tenantPlan, onAdd, onEdit }: ConnectionListProps) {
  const integrations = useIntegrations()
  const health = useIntegrationsHealth()
  const updateMutation = useUpdateIntegration()
  const deleteMutation = useDeleteIntegration()
  const testMutation = useTestIntegration()
  const [testingId, setTestingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const limit = siemIntegrationLimit(tenantPlan)
  const count = integrations.data?.total ?? 0
  const atLimit = limit != null && count >= limit

  const healthFor = (id: string) => health.data?.integrations.find(h => h.integrationId === id)

  const runTest = (id: string) => {
    setTestingId(id)
    testMutation.mutate(id, {
      onSuccess: r => toast(r.message || (r.success ? 'Connection successful' : 'Test failed'), r.success ? 'success' : 'error'),
      onError: e => toast(e instanceof Error ? e.message : 'Test failed', 'error'),
      onSettled: () => setTestingId(null),
    })
  }

  const toggleEnabled = (integration: Integration) => {
    updateMutation.mutate({ id: integration.id, input: { enabled: !integration.enabled } }, {
      onError: () => toast('Could not update connection', 'error'),
    })
  }

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast('Connection deleted', 'success'),
      onError: () => toast('Could not delete connection', 'error'),
      onSettled: () => setConfirmDeleteId(null),
    })
  }

  return (
    <div className="space-y-3" data-testid="connection-list">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">Connected</h3>
        <div className="flex items-center gap-2">
          {limit != null && (
            <span className="text-[10px] text-text-muted" data-testid="connection-limit">{count} of {limit} used</span>
          )}
          <button
            onClick={onAdd}
            disabled={atLimit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-bg-primary rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="add-connection-btn"
          >
            <Plus className="w-3.5 h-3.5" /> Add connection
          </button>
        </div>
      </div>

      {atLimit && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-accent/10 border border-accent/20 rounded-lg text-[11px]" data-testid="plan-limit-banner">
          <span className="text-text-secondary">You&apos;ve reached your plan&apos;s SIEM integration limit ({limit}).</span>
          <a href={salesMailto('Upgrade for more SIEM integrations')} className="text-accent font-medium hover:underline shrink-0">Upgrade</a>
        </div>
      )}

      <QueryStateView
        query={integrations}
        resource="connections"
        isEmpty={d => d.data.length === 0}
        empty={
          <div className="text-center py-8 border border-dashed border-border rounded-lg" data-testid="connections-empty">
            <Plug className="w-5 h-5 text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted mb-3">No connections yet</p>
            <button onClick={onAdd} className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent rounded-lg hover:bg-accent/20">
              Add connection
            </button>
          </div>
        }
      >
        {data => (
          <div className="space-y-2">
            {data.data.map(integration => {
              const h = healthFor(integration.id)
              const unhealthy = !!h && h.totalCount > 0 && h.successRate < 50
              return (
                <div
                  key={integration.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 border border-border rounded-lg bg-bg-primary"
                  data-testid={`connection-${integration.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-text-primary truncate" title={integration.name}>{integration.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted shrink-0">{CONNECTOR_TYPES[integration.type].label}</span>
                      {!integration.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-muted shrink-0">Disabled</span>}
                      {unhealthy && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sev-high/20 text-sev-high shrink-0 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Unhealthy
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted">Last used {timeAgo(integration.lastUsedAt)}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer mr-1" title={integration.enabled ? 'Disable' : 'Enable'}>
                      <input
                        type="checkbox"
                        checked={integration.enabled}
                        onChange={() => toggleEnabled(integration)}
                        className="sr-only peer"
                        aria-label={`${integration.enabled ? 'Disable' : 'Enable'} ${integration.name}`}
                        data-testid={`toggle-${integration.id}`}
                      />
                      <div className="w-8 h-4 bg-bg-elevated peer-checked:bg-accent rounded-full border border-border transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-text-muted peer-checked:bg-white peer-checked:translate-x-4 rounded-full transition-transform" />
                    </label>
                    <button
                      onClick={() => runTest(integration.id)}
                      disabled={testingId === integration.id}
                      className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-50"
                      aria-label={`Test ${integration.name}`}
                      data-testid={`test-${integration.id}`}
                    >
                      {testingId === integration.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => onEdit(integration)}
                      className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover"
                      aria-label={`Edit ${integration.name}`}
                      data-testid={`edit-${integration.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(integration.id)}
                      className="p-1.5 rounded border border-border text-text-muted hover:text-sev-critical hover:bg-sev-critical/10"
                      aria-label={`Delete ${integration.name}`}
                      data-testid={`delete-${integration.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </QueryStateView>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" data-testid="delete-confirm-dialog">
          <div className={cn('bg-bg-primary border border-border rounded-xl p-5 max-w-sm w-full shadow-card')}>
            <h3 className="text-sm font-bold text-text-primary mb-2">Delete connection?</h3>
            <p className="text-xs text-text-muted mb-4">This can&apos;t be undone. Events will stop being sent to this destination immediately.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
                data-testid="delete-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-xs font-medium bg-sev-critical text-white rounded-lg hover:bg-sev-critical/80 disabled:opacity-50 transition-colors"
                data-testid="delete-confirm-btn"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
