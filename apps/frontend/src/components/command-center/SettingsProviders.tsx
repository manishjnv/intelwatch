/**
 * @module components/command-center/SettingsProviders
 * @description Provider key cards and model dropdown for Settings tab (super-admin).
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Key, CheckCircle, XCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  type AiProvider, MODEL_CATALOG, PROVIDER_META, PROVIDERS,
  getAccuracy, estimatePerItemCost,
} from './settings-data'

// ─── Provider Key Card ──────────────────────────────────────────

export function ProviderKeyCard({
  provider, providerKey, onSetKey, onTestKey, onRemoveKey, isSettingKey, isTestingKey,
}: {
  provider: typeof PROVIDERS[number]
  providerKey: { keyMasked: string | null; isValid: boolean; lastTested: string | null }
  onSetKey: (provider: string, apiKey: string) => void
  onTestKey: (provider: string, apiKey: string) => Promise<unknown>
  onRemoveKey: (provider: string) => void
  isSettingKey: boolean
  isTestingKey: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const hasKey = providerKey.keyMasked != null
  const meta = PROVIDER_META[provider.id]

  const handleSave = () => {
    if (keyInput.length >= 10) {
      onSetKey(provider.id, keyInput)
      setKeyInput('')
      setEditing(false)
    }
  }

  const handleTest = async () => {
    const key = keyInput || providerKey.keyMasked || ''
    if (key.length < 10 && !hasKey) return
    try {
      const result = await onTestKey(provider.id, keyInput || 'existing') as { success: boolean; error?: string }
      setTestResult(result)
    } catch {
      setTestResult({ success: false, error: 'Connection failed' })
    }
  }

  return (
    <div data-testid={`provider-card-${provider.id}`} className="p-4 bg-bg-elevated rounded-lg border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: provider.color }} />
          <span className="font-semibold text-text-primary text-sm">{provider.label}</span>
        </div>
        {hasKey && providerKey.isValid ? (
          <span className="flex items-center gap-1 text-xs text-sev-low"><CheckCircle className="w-3 h-3" /> Connected</span>
        ) : hasKey ? (
          <span className="flex items-center gap-1 text-xs text-sev-high"><XCircle className="w-3 h-3" /> Invalid</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-text-muted"><XCircle className="w-3 h-3" /> Not set</span>
        )}
      </div>

      {hasKey && !editing ? (
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-3 h-3 text-text-muted" />
          <code className="text-xs text-text-secondary font-mono flex-1">
            {showKey ? providerKey.keyMasked : '\u2022'.repeat(20)}
          </code>
          <button onClick={() => setShowKey(!showKey)} className="text-text-muted hover:text-text-primary">
            {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3">
          <input
            data-testid={`key-input-${provider.id}`}
            type="password"
            placeholder={`${meta.keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022`}
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            className="flex-1 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted"
          />
          <button
            data-testid={`save-key-${provider.id}`}
            onClick={handleSave}
            disabled={keyInput.length < 10 || isSettingKey}
            className="px-2 py-1.5 bg-brand text-white rounded text-xs font-medium disabled:opacity-50"
          >
            {isSettingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          data-testid={`test-key-${provider.id}`}
          onClick={handleTest}
          disabled={isTestingKey || (!hasKey && keyInput.length < 10)}
          className="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {isTestingKey ? 'Testing...' : 'Test Connection'}
        </button>
        {hasKey && !editing && (
          <>
            <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:text-text-primary">
              Update Key
            </button>
            <button
              data-testid={`remove-key-${provider.id}`}
              onClick={() => onRemoveKey(provider.id)}
              className="text-xs px-2 py-1 rounded border border-border text-sev-high hover:bg-sev-high/10"
            >
              Remove
            </button>
          </>
        )}
      </div>

      {testResult && (
        <p className={cn('text-[10px] mt-2', testResult.success ? 'text-sev-low' : 'text-sev-high')}>
          {testResult.success ? 'Connection successful' : testResult.error ?? 'Connection failed'}
        </p>
      )}

      <p className="text-[10px] text-text-muted mt-3">
        {hasKey ? 'Models available: ' : 'Add key to unlock: '}{provider.models.join(', ')}
      </p>
    </div>
  )
}

// ─── Model Dropdown ─────────────────────────────────────────────

export function ModelDropdown({
  currentModelId, subtask, providerKeys, onChange,
}: {
  currentModelId: string; subtask: string
  providerKeys: { provider: string; isValid: boolean }[]
  onChange: (modelId: string) => void
}) {
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof MODEL_CATALOG> = {}
    for (const m of MODEL_CATALOG) { ;(groups[m.provider] ??= []).push(m) }
    return groups
  }, [])

  const bestAccuracyId = useMemo(() => {
    let best = '', bestScore = -1
    for (const m of MODEL_CATALOG) {
      const acc = getAccuracy(m.id, subtask)
      if (acc > bestScore) { bestScore = acc; best = m.id }
    }
    return best
  }, [subtask])

  const bestCostId = useMemo(() => {
    let best = '', bestCost = Infinity
    for (const m of MODEL_CATALOG) {
      const cost = estimatePerItemCost(m.id)
      if (cost < bestCost && cost > 0) { bestCost = cost; best = m.id }
    }
    return best
  }, [])

  return (
    <select
      data-testid={`model-select-${subtask}`}
      value={currentModelId}
      onChange={e => onChange(e.target.value)}
      className="bg-bg-elevated border border-border rounded px-2 py-1 text-text-primary text-xs w-full max-w-[220px]"
    >
      {Object.entries(groupedModels).map(([provider, models]) => {
        const hasKey = providerKeys.find(k => k.provider === provider)?.isValid ?? false
        return (
          <optgroup key={provider} label={`\u2500\u2500 ${PROVIDER_META[provider as AiProvider]?.label ?? provider} \u2500\u2500`}>
            {models.map(m => {
              const acc = getAccuracy(m.id, subtask)
              const cost = estimatePerItemCost(m.id)
              const star = m.id === bestAccuracyId ? ' \u2605acc' : m.id === bestCostId ? ' \u2605cost' : ''
              return (
                <option key={m.id} value={m.id} disabled={!hasKey}>
                  {m.displayName} \u2014 {acc}% \u2014 ${cost.toFixed(4)}{star}{!hasKey ? ' (no key)' : ''}
                </option>
              )
            })}
          </optgroup>
        )
      })}
    </select>
  )
}
