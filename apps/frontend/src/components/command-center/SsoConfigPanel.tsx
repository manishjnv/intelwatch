/**
 * @module components/command-center/SsoConfigPanel
 * @description SSO configuration panel — tenant_admin edits, super_admin views.
 * Provider selection (SAML/OIDC), config form, test connection,
 * group-to-role mappings, approved domains, status badge.
 */
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  useSsoConfig, useSaveSsoConfig, useDeleteSsoConfig,
  useTestSsoConnection, useAdminSsoConfig,
  type SsoProvider, type GroupRoleMapping, type SsoConfig,
} from '@/hooks/use-sso'
import {
  Shield, Key, Globe, X, Plus, Trash2,
  CheckCircle, AlertTriangle, Loader2, Settings,
} from 'lucide-react'

// ─── SSO Status Badge ───────────────────────────────────────

export function SsoStatusBadge({ config }: { config: SsoConfig | null }) {
  if (!config) {
    return <span className="px-2 py-0.5 text-[10px] rounded font-medium bg-bg-hover text-text-muted">SSO Not Configured</span>
  }
  if (!config.enabled) {
    return <span className="px-2 py-0.5 text-[10px] rounded font-medium bg-amber-400/20 text-amber-400">SSO Configured (Disabled)</span>
  }
  return (
    <span className="px-2 py-0.5 text-[10px] rounded font-medium bg-sev-low/20 text-sev-low">
      SSO Active: {config.provider.toUpperCase()}
    </span>
  )
}

// ─── Domain Tag Input ───────────────────────────────────────

function DomainTagInput({ domains, onChange }: { domains: string[]; onChange: (d: string[]) => void }) {
  const [input, setInput] = useState('')

  const addDomain = () => {
    const d = input.trim().toLowerCase()
    if (d && !domains.includes(d)) {
      onChange([...domains, d])
    }
    setInput('')
  }

  return (
    <div data-testid="domain-tag-input">
      <div className="flex flex-wrap gap-1 mb-1.5">
        {domains.map(d => (
          <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-accent/10 text-accent rounded-full">
            {d}
            <button onClick={() => onChange(domains.filter(x => x !== d))} className="hover:text-sev-critical" data-testid={`remove-domain-${d}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          data-testid="domain-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain() } }}
          placeholder="acme.com"
          className="flex-1 px-2 py-1 text-xs bg-bg-elevated border border-border rounded text-text-primary placeholder:text-text-muted"
        />
        <button onClick={addDomain} className="px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20" data-testid="add-domain-btn">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Group Mapping Table ────────────────────────────────────

function GroupMappingTable({ mappings, onChange }: { mappings: GroupRoleMapping[]; onChange: (m: GroupRoleMapping[]) => void }) {
  const addRow = () => onChange([...mappings, { groupName: '', role: 'analyst' }])
  const removeRow = (i: number) => onChange(mappings.filter((_, idx) => idx !== i))
  const updateRow = (i: number, field: keyof GroupRoleMapping, value: string) => {
    const updated = [...mappings]
    updated[i] = { ...updated[i], [field]: value }
    onChange(updated)
  }

  return (
    <div data-testid="group-mapping-table">
      <div className="space-y-2">
        {mappings.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              data-testid={`group-name-${i}`}
              value={m.groupName}
              onChange={e => updateRow(i, 'groupName', e.target.value)}
              placeholder="IdP Group Name"
              className="flex-1 px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded text-text-primary placeholder:text-text-muted"
            />
            <select
              data-testid={`group-role-${i}`}
              value={m.role}
              onChange={e => updateRow(i, 'role', e.target.value)}
              className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded text-text-primary"
            >
              <option value="tenant_admin">Tenant Admin</option>
              <option value="analyst">Analyst</option>
            </select>
            <input
              data-testid={`group-designation-${i}`}
              value={m.designation ?? ''}
              onChange={e => updateRow(i, 'designation', e.target.value)}
              placeholder="Designation (optional)"
              className="flex-1 px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded text-text-primary placeholder:text-text-muted hidden sm:block"
            />
            <button onClick={() => removeRow(i)} className="p-1 text-text-muted hover:text-sev-critical" data-testid={`remove-mapping-${i}`}>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="mt-2 flex items-center gap-1 px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded" data-testid="add-mapping-btn">
        <Plus className="w-3 h-3" /> Add Mapping
      </button>
      <p className="mt-1 text-[10px] text-text-muted">
        Map your identity provider groups to platform roles. Users in unmapped groups will be assigned the Analyst role by default.
      </p>
    </div>
  )
}

// ─── Delete Confirm Modal ───────────────────────────────────

function DeleteSsoModal({ onConfirm, onCancel, isPending }: {
  onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="delete-sso-modal">
      <div className="bg-bg-primary border border-border rounded-lg p-5 max-w-sm w-full mx-4 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Remove SSO Configuration</h3>
        <p className="text-xs text-text-secondary">
          This will remove SSO and all group mappings. Users will need to log in with email/password.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button
            data-testid="delete-sso-confirm-btn"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-1.5 text-xs bg-sev-critical text-white rounded-lg hover:bg-sev-critical/80 disabled:opacity-50"
          >
            {isPending ? 'Removing...' : 'Remove SSO'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Read-Only Admin View ───────────────────────────────────

export function AdminSsoView({ tenantId }: { tenantId: string }) {
  const { data: config, isLoading, isDemo } = useAdminSsoConfig(tenantId)

  if (isLoading) {
    return <div className="h-20 bg-bg-elevated rounded animate-pulse" />
  }

  if (!config) {
    return <p className="text-xs text-text-muted p-3 bg-bg-elevated rounded-lg border border-border">SSO not configured for this tenant.</p>
  }

  return (
    <div className="space-y-3" data-testid="admin-sso-view">
      {isDemo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-text-muted">Provider:</span> <span className="text-text-primary">{config.provider.toUpperCase()}</span></div>
        <div><span className="text-text-muted">Enabled:</span> <span className={config.enabled ? 'text-sev-low' : 'text-sev-high'}>{config.enabled ? 'Yes' : 'No'}</span></div>
        {config.entityId && <div><span className="text-text-muted">Entity ID:</span> <span className="text-text-primary break-all">{config.entityId}</span></div>}
        {config.issuerUrl && <div><span className="text-text-muted">Issuer:</span> <span className="text-text-primary break-all">{config.issuerUrl}</span></div>}
      </div>
      {config.approvedDomains.length > 0 && (
        <div>
          <span className="text-[10px] text-text-muted">Approved Domains:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {config.approvedDomains.map(d => (
              <span key={d} className="px-2 py-0.5 text-[10px] bg-accent/10 text-accent rounded-full">{d}</span>
            ))}
          </div>
        </div>
      )}
      {config.groupMappings.length > 0 && (
        <div>
          <span className="text-[10px] text-text-muted">Group Mappings:</span>
          <div className="mt-1 space-y-1">
            {config.groupMappings.map((m, i) => (
              <div key={i} className="text-xs text-text-secondary">
                {m.groupName} → <span className="capitalize text-text-primary">{m.role.replace(/_/g, ' ')}</span>
                {m.designation && <span className="text-text-muted"> ({m.designation})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main SSO Config Panel ──────────────────────────────────

export function SsoConfigPanel() {
  const { data: existingConfig, isLoading } = useSsoConfig()
  const saveMut = useSaveSsoConfig()
  const deleteMut = useDeleteSsoConfig()
  const testMut = useTestSsoConnection()

  const [provider, setProvider] = useState<SsoProvider>('saml')
  const [enabled, setEnabled] = useState(false)
  // SAML
  const [entityId, setEntityId] = useState('')
  const [metadataUrl, setMetadataUrl] = useState('')
  const [certificate, setCertificate] = useState('')
  // OIDC
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [issuerUrl, setIssuerUrl] = useState('')
  // Common
  const [approvedDomains, setApprovedDomains] = useState<string[]>([])
  const [groupMappings, setGroupMappings] = useState<GroupRoleMapping[]>([])
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  // Load existing config into form
  useEffect(() => {
    if (existingConfig) {
      setProvider(existingConfig.provider)
      setEnabled(existingConfig.enabled)
      setEntityId(existingConfig.entityId ?? '')
      setMetadataUrl(existingConfig.metadataUrl ?? '')
      setCertificate(existingConfig.certificate ?? '')
      setClientId(existingConfig.clientId ?? '')
      setClientSecret('') // never pre-fill actual secret
      setIssuerUrl(existingConfig.issuerUrl ?? '')
      setApprovedDomains(existingConfig.approvedDomains)
      setGroupMappings(existingConfig.groupMappings)
    }
  }, [existingConfig])

  const hasExistingSecret = !!(existingConfig?.clientSecret)

  const handleSave = () => {
    const config: Partial<SsoConfig> = {
      provider,
      enabled,
      approvedDomains,
      groupMappings,
    }
    if (provider === 'saml') {
      config.entityId = entityId
      config.metadataUrl = metadataUrl
      config.certificate = certificate
    } else {
      config.clientId = clientId
      if (clientSecret) config.clientSecret = clientSecret
      config.issuerUrl = issuerUrl
    }
    saveMut.mutate(config)
  }

  const handleTest = () => {
    setTestResult(null)
    testMut.mutate(undefined, {
      onSuccess: (data) => setTestResult(data ?? { success: false, error: 'No response' }),
      onError: (err) => setTestResult({ success: false, error: err.message }),
    })
  }

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-bg-elevated rounded animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-4 max-w-2xl" data-testid="sso-config-panel">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <SsoStatusBadge config={existingConfig} />
      </div>

      {/* Provider Selection */}
      <div>
        <label className="text-xs text-text-muted block mb-1.5">Provider</label>
        <div className="flex gap-2" data-testid="provider-selector">
          {(['saml', 'oidc'] as SsoProvider[]).map(p => (
            <button
              key={p}
              data-testid={`provider-${p}`}
              onClick={() => setProvider(p)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
                provider === p
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-bg-elevated text-text-muted hover:text-text-primary',
              )}
            >
              {p === 'saml' ? <Shield className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
              {p === 'saml' ? 'SAML 2.0' : 'OIDC'}
            </button>
          ))}
        </div>
      </div>

      {/* Provider-specific fields */}
      {provider === 'saml' ? (
        <div className="space-y-3" data-testid="saml-fields">
          <div>
            <label className="text-xs text-text-muted block mb-1">Entity ID *</label>
            <input
              data-testid="entity-id-input"
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              placeholder="https://idp.example.com/metadata"
              className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Metadata URL</label>
            <input
              data-testid="metadata-url-input"
              value={metadataUrl}
              onChange={e => setMetadataUrl(e.target.value)}
              placeholder="https://idp.example.com/saml2/metadata"
              className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Certificate (x509)</label>
            <textarea
              data-testid="certificate-input"
              value={certificate}
              onChange={e => setCertificate(e.target.value)}
              placeholder="Paste x509 certificate..."
              rows={3}
              className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted resize-none"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="oidc-fields">
          <div>
            <label className="text-xs text-text-muted block mb-1">Client ID *</label>
            <input
              data-testid="client-id-input"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="your-client-id"
              className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Client Secret *</label>
            <input
              data-testid="client-secret-input"
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={hasExistingSecret ? '•••••••••••••••' : 'Enter client secret'}
              className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
            {hasExistingSecret && !clientSecret && (
              <p className="text-[10px] text-text-muted mt-0.5">Leave blank to keep existing secret.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Issuer URL *</label>
            <input
              data-testid="issuer-url-input"
              value={issuerUrl}
              onChange={e => setIssuerUrl(e.target.value)}
              placeholder="https://accounts.google.com"
              className="w-full px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
          </div>
        </div>
      )}

      {/* Enabled toggle */}
      <div className="flex items-center gap-2">
        <button
          data-testid="sso-enabled-toggle"
          onClick={() => setEnabled(!enabled)}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors',
            enabled ? 'bg-sev-low' : 'bg-bg-hover',
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )} />
        </button>
        <span className="text-xs text-text-secondary">SSO {enabled ? 'Enabled' : 'Disabled'}</span>
      </div>

      {/* Approved Domains */}
      <div>
        <label className="text-xs text-text-muted block mb-1.5">Approved Domains</label>
        <DomainTagInput domains={approvedDomains} onChange={setApprovedDomains} />
      </div>

      {/* Group-to-Role Mappings */}
      <div>
        <label className="text-xs text-text-muted block mb-1.5">Group-to-Role Mappings</label>
        <GroupMappingTable mappings={groupMappings} onChange={setGroupMappings} />
      </div>

      {/* Test result */}
      {testResult && (
        <div className={cn(
          'flex items-center gap-2 p-2.5 rounded-lg border text-xs',
          testResult.success
            ? 'bg-sev-low/10 border-sev-low/30 text-sev-low'
            : 'bg-sev-critical/10 border-sev-critical/30 text-sev-critical',
        )} data-testid="test-result">
          {testResult.success
            ? <><CheckCircle className="w-3.5 h-3.5" /> Connection successful</>
            : <><AlertTriangle className="w-3.5 h-3.5" /> Failed: {testResult.error}</>
          }
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
        <button
          data-testid="sso-save-btn"
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-accent text-bg-primary rounded-lg hover:bg-accent/80 disabled:opacity-50"
        >
          {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
          Save
        </button>
        <button
          data-testid="sso-test-btn"
          onClick={handleTest}
          disabled={testMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {testMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
          Test Connection
        </button>
        {existingConfig && (
          <button
            data-testid="sso-remove-btn"
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sev-critical border border-sev-critical/30 rounded-lg hover:bg-sev-critical/10"
          >
            <Trash2 className="w-3 h-3" /> Remove SSO
          </button>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <DeleteSsoModal
          isPending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(undefined, { onSuccess: () => setShowDeleteModal(false) })}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}
