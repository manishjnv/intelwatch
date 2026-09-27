/**
 * @module components/command-center/ApiKeysPanel
 * @description Self-serve API key management for the public REST API + TAXII 2.1 feed
 * (S167). Plan-gated behind `api_access` via FeatureGate. The raw key is returned exactly
 * once on create (api-keys.ts:90) and lives only in this component's local state — never
 * written to the query cache or localStorage — so closing the dialog discards it for good.
 */
import { useEffect, useRef, useState } from 'react'
import { QueryStateView } from '@/components/ui/QueryStateView'
import { toast } from '@/components/ui/Toast'
import { FeatureGate } from '@/components/FeatureGate'
import { ApiError } from '@/lib/api'
import {
  useApiKeys, useCreateApiKey, useRevokeApiKey, API_KEY_SCOPES,
  type ApiKeySummary,
} from '@/hooks/use-api-keys'
import { Key, Plus, Copy, Check, Trash2, X } from 'lucide-react'

const EXPIRY_OPTIONS: { label: string; days: number | undefined }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'Never', days: undefined },
]

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Create dialog ──────────────────────────────────────────

function CreateKeyDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['ioc:read'])
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const createMutation = useCreateApiKey()
  const nameInputRef = useRef<HTMLInputElement>(null)

  const toggleScope = (scope: string) =>
    setScopes(prev => (prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]))

  // Raw key is component state only — clearing it here (both on Escape and Close) is what
  // keeps it from ever reaching the query cache or persisting past this dialog's lifetime.
  const handleClose = () => {
    setCreatedKey(null)
    onClose()
  }
  const closeRef = useRef(handleClose)
  closeRef.current = handleClose

  useEffect(() => {
    nameInputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleCreate = () => {
    if (!name.trim() || scopes.length === 0) return
    createMutation.mutate({ name: name.trim(), scopes, expiresInDays }, {
      onSuccess: created => setCreatedKey(created.key),
      onError: err => toast(err instanceof ApiError ? err.message : 'Could not create API key', 'error'),
    })
  }

  const copyKey = () => {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
      .then(() => { setCopied(true); toast('API key copied', 'success') })
      .catch(() => toast('Could not copy — copy it manually', 'error'))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center" data-testid="create-api-key-dialog">
      <div
        role="dialog" aria-modal="true" aria-label="Create API key"
        className="bg-bg-primary border border-border rounded-t-xl md:rounded-xl p-5 w-full md:max-w-md max-h-[90vh] overflow-y-auto shadow-card"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary">{createdKey ? 'API key created' : 'Create API key'}</h3>
          <button onClick={handleClose} aria-label="Close" data-testid="create-key-close-btn" className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdKey ? (
          <div className="space-y-3">
            <p className="text-xs text-sev-high font-medium" role="alert">Copy it now — you won&apos;t see it again.</p>
            <div className="flex items-center gap-2">
              <code
                data-testid="raw-api-key"
                className="flex-1 min-w-0 break-all px-2 py-1.5 text-[11px] bg-bg-secondary border border-border rounded font-mono text-text-secondary"
              >
                {createdKey}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium border border-border rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
                data-testid="copy-raw-key-btn"
              >
                {copied ? <Check className="w-3 h-3 text-sev-low" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded-lg hover:bg-accent/90"
              data-testid="create-key-done-btn"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs">
              <span className="text-text-muted mb-1 block">Name</span>
              <input
                ref={nameInputRef}
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Splunk TAXII pull"
                className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                data-testid="api-key-name-input"
              />
            </label>

            <fieldset className="space-y-1.5">
              <legend className="text-xs text-text-muted mb-1">Scopes</legend>
              {API_KEY_SCOPES.map(s => (
                <label key={s.scope} className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.scope)}
                    onChange={() => toggleScope(s.scope)}
                    className="mt-0.5"
                    data-testid={`scope-${s.scope}`}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </fieldset>

            <label className="block text-xs">
              <span className="text-text-muted mb-1 block">Expires</span>
              <select
                value={expiresInDays ?? ''}
                onChange={e => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                data-testid="api-key-expiry-select"
              >
                {EXPIRY_OPTIONS.map(o => (
                  <option key={o.label} value={o.days ?? ''}>{o.label}</option>
                ))}
              </select>
            </label>

            <button
              onClick={handleCreate}
              disabled={!name.trim() || scopes.length === 0 || createMutation.isPending}
              className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="create-key-submit-btn"
            >
              {createMutation.isPending ? 'Creating…' : 'Create API key'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Key row ────────────────────────────────────────────────

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKeySummary; onRevoke: (id: string) => void }) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 border border-border rounded-lg bg-bg-primary"
      data-testid={`api-key-${apiKey.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-primary truncate">{apiKey.name}</span>
          <code className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted font-mono">{apiKey.prefix}…</code>
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-1">
          {apiKey.scopes.map(s => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{s}</span>
          ))}
        </div>
        <div className="text-[10px] text-text-muted mt-1">
          Created {formatDate(apiKey.createdAt)} · Last used {timeAgo(apiKey.lastUsed)} · Expires {formatDate(apiKey.expiresAt)}
        </div>
      </div>
      <button
        onClick={() => onRevoke(apiKey.id)}
        className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium border border-border rounded text-text-muted hover:text-sev-critical hover:bg-sev-critical/10"
        data-testid={`revoke-${apiKey.id}`}
        aria-label={`Revoke ${apiKey.name}`}
      >
        <Trash2 className="w-3 h-3" /> Revoke
      </button>
    </div>
  )
}

// ─── List + revoke confirm ──────────────────────────────────

function ApiKeysList() {
  const keysQuery = useApiKeys()
  const revokeMutation = useRevokeApiKey()
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  const confirmRevoke = () => {
    if (!confirmRevokeId) return
    revokeMutation.mutate(confirmRevokeId, {
      onSuccess: () => toast('API key revoked', 'success'),
      onError: () => toast('Could not revoke API key', 'error'),
      onSettled: () => setConfirmRevokeId(null),
    })
  }

  return (
    <div className="space-y-3" data-testid="api-keys-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">API keys</h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-bg-primary rounded-lg hover:bg-accent/90"
          data-testid="create-api-key-btn"
        >
          <Plus className="w-3.5 h-3.5" /> Create API key
        </button>
      </div>

      <QueryStateView
        query={keysQuery}
        resource="API keys"
        isEmpty={d => d.data.length === 0}
        empty={
          <div className="text-center py-8 border border-dashed border-border rounded-lg" data-testid="api-keys-empty">
            <Key className="w-5 h-5 text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted mb-3">No API keys yet</p>
            <button onClick={() => setCreateOpen(true)} className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent rounded-lg hover:bg-accent/20">
              Create API key
            </button>
          </div>
        }
      >
        {data => (
          <div className="space-y-2">
            {data.data.map(k => (
              <KeyRow key={k.id} apiKey={k} onRevoke={setConfirmRevokeId} />
            ))}
          </div>
        )}
      </QueryStateView>

      {createOpen && <CreateKeyDialog onClose={() => setCreateOpen(false)} />}

      {confirmRevokeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" data-testid="revoke-confirm-dialog">
          <div className="bg-bg-primary border border-border rounded-xl p-5 max-w-sm w-full shadow-card">
            <h3 className="text-sm font-bold text-text-primary mb-2">Revoke API key?</h3>
            <p className="text-xs text-text-muted mb-4">Any integration using this key will immediately lose access. This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRevokeId(null)}
                className="flex-1 py-2 text-xs font-medium border border-border text-text-secondary rounded-lg hover:text-text-primary transition-colors"
                data-testid="revoke-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevoke}
                disabled={revokeMutation.isPending}
                className="flex-1 py-2 text-xs font-medium bg-sev-critical text-white rounded-lg hover:bg-sev-critical/80 disabled:opacity-50"
                data-testid="revoke-confirm-btn"
              >
                {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Plan-gated entry point ─────────────────────────────────

export function ApiKeysPanel() {
  return (
    <FeatureGate feature="api_access">
      <ApiKeysList />
    </FeatureGate>
  )
}
