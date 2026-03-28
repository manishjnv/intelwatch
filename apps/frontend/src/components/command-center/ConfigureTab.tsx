/**
 * @module components/command-center/ConfigureTab
 * @description Tab 4: Super-admin configuration — provider API keys,
 * multi-provider model assignments, confidence model toggle.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import type { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import {
  Key, CheckCircle, XCircle, Eye, EyeOff, Loader2,
  Save, RotateCcw, Shield,
} from 'lucide-react'

// ─── Model Catalog (frontend mirror of @etip/shared-utils/model-registry) ──

type AiProvider = 'anthropic' | 'openai' | 'google'

interface ModelDefinition {
  id: string; provider: AiProvider; displayName: string
  pricing: { inputPer1M: number; outputPer1M: number }
  benchmarks: { subtask: string; accuracy: number }[]
}

const MODEL_CATALOG: ModelDefinition[] = [
  { id: 'claude-opus-4-6', provider: 'anthropic', displayName: 'Claude Opus 4.6', pricing: { inputPer1M: 15, outputPer1M: 75 }, benchmarks: [{ subtask: 'triage', accuracy: 88 }, { subtask: 'extraction', accuracy: 96 }, { subtask: 'classification', accuracy: 95 }, { subtask: 'summarization', accuracy: 96 }, { subtask: 'translation', accuracy: 93 }, { subtask: 'risk_scoring', accuracy: 96 }, { subtask: 'context_gen', accuracy: 95 }, { subtask: 'attribution', accuracy: 96 }, { subtask: 'campaign_link', accuracy: 93 }, { subtask: 'false_positive', accuracy: 88 }, { subtask: 'exec_summary', accuracy: 96 }, { subtask: 'technical_detail', accuracy: 95 }, { subtask: 'trend_analysis', accuracy: 94 }, { subtask: 'recommendation', accuracy: 90 }, { subtask: 'formatting', accuracy: 88 }] },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', displayName: 'Claude Sonnet 4.6', pricing: { inputPer1M: 3, outputPer1M: 15 }, benchmarks: [{ subtask: 'triage', accuracy: 84 }, { subtask: 'extraction', accuracy: 92 }, { subtask: 'classification', accuracy: 91 }, { subtask: 'summarization', accuracy: 92 }, { subtask: 'translation', accuracy: 89 }, { subtask: 'risk_scoring', accuracy: 94 }, { subtask: 'context_gen', accuracy: 92 }, { subtask: 'attribution', accuracy: 92 }, { subtask: 'campaign_link', accuracy: 89 }, { subtask: 'false_positive', accuracy: 84 }, { subtask: 'exec_summary', accuracy: 93 }, { subtask: 'technical_detail', accuracy: 91 }, { subtask: 'trend_analysis', accuracy: 90 }, { subtask: 'recommendation', accuracy: 85 }, { subtask: 'formatting', accuracy: 83 }] },
  { id: 'claude-haiku-4-5', provider: 'anthropic', displayName: 'Claude Haiku 4.5', pricing: { inputPer1M: 0.8, outputPer1M: 4 }, benchmarks: [{ subtask: 'triage', accuracy: 78 }, { subtask: 'extraction', accuracy: 80 }, { subtask: 'classification', accuracy: 79 }, { subtask: 'summarization', accuracy: 78 }, { subtask: 'translation', accuracy: 76 }, { subtask: 'risk_scoring', accuracy: 80 }, { subtask: 'context_gen', accuracy: 78 }, { subtask: 'attribution', accuracy: 76 }, { subtask: 'campaign_link', accuracy: 74 }, { subtask: 'false_positive', accuracy: 78 }, { subtask: 'exec_summary', accuracy: 76 }, { subtask: 'technical_detail', accuracy: 74 }, { subtask: 'trend_analysis', accuracy: 72 }, { subtask: 'recommendation', accuracy: 76 }, { subtask: 'formatting', accuracy: 74 }] },
  { id: 'o3', provider: 'openai', displayName: 'o3', pricing: { inputPer1M: 10, outputPer1M: 40 }, benchmarks: [{ subtask: 'triage', accuracy: 86 }, { subtask: 'extraction', accuracy: 94 }, { subtask: 'classification', accuracy: 93 }, { subtask: 'summarization', accuracy: 93 }, { subtask: 'translation', accuracy: 91 }, { subtask: 'risk_scoring', accuracy: 95 }, { subtask: 'context_gen', accuracy: 93 }, { subtask: 'attribution', accuracy: 95 }, { subtask: 'campaign_link', accuracy: 91 }, { subtask: 'false_positive', accuracy: 86 }, { subtask: 'exec_summary', accuracy: 94 }, { subtask: 'technical_detail', accuracy: 93 }, { subtask: 'trend_analysis', accuracy: 92 }, { subtask: 'recommendation', accuracy: 88 }, { subtask: 'formatting', accuracy: 85 }] },
  { id: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o', pricing: { inputPer1M: 2.5, outputPer1M: 10 }, benchmarks: [{ subtask: 'triage', accuracy: 82 }, { subtask: 'extraction', accuracy: 89 }, { subtask: 'classification', accuracy: 88 }, { subtask: 'summarization', accuracy: 89 }, { subtask: 'translation', accuracy: 87 }, { subtask: 'risk_scoring', accuracy: 90 }, { subtask: 'context_gen', accuracy: 89 }, { subtask: 'attribution', accuracy: 88 }, { subtask: 'campaign_link', accuracy: 86 }, { subtask: 'false_positive', accuracy: 82 }, { subtask: 'exec_summary', accuracy: 90 }, { subtask: 'technical_detail', accuracy: 88 }, { subtask: 'trend_analysis', accuracy: 87 }, { subtask: 'recommendation', accuracy: 83 }, { subtask: 'formatting', accuracy: 81 }] },
  { id: 'o3-mini', provider: 'openai', displayName: 'o3-mini', pricing: { inputPer1M: 1.1, outputPer1M: 4.4 }, benchmarks: [{ subtask: 'triage', accuracy: 80 }, { subtask: 'extraction', accuracy: 85 }, { subtask: 'classification', accuracy: 83 }, { subtask: 'summarization', accuracy: 84 }, { subtask: 'translation', accuracy: 82 }, { subtask: 'risk_scoring', accuracy: 86 }, { subtask: 'context_gen', accuracy: 84 }, { subtask: 'attribution', accuracy: 83 }, { subtask: 'campaign_link', accuracy: 80 }, { subtask: 'false_positive', accuracy: 80 }, { subtask: 'exec_summary', accuracy: 84 }, { subtask: 'technical_detail', accuracy: 82 }, { subtask: 'trend_analysis', accuracy: 81 }, { subtask: 'recommendation', accuracy: 80 }, { subtask: 'formatting', accuracy: 78 }] },
  { id: 'gpt-4o-mini', provider: 'openai', displayName: 'GPT-4o Mini', pricing: { inputPer1M: 0.15, outputPer1M: 0.6 }, benchmarks: [{ subtask: 'triage', accuracy: 76 }, { subtask: 'extraction', accuracy: 79 }, { subtask: 'classification', accuracy: 81 }, { subtask: 'summarization', accuracy: 78 }, { subtask: 'translation', accuracy: 77 }, { subtask: 'risk_scoring', accuracy: 78 }, { subtask: 'context_gen', accuracy: 76 }, { subtask: 'attribution', accuracy: 74 }, { subtask: 'campaign_link', accuracy: 72 }, { subtask: 'false_positive', accuracy: 76 }, { subtask: 'exec_summary', accuracy: 74 }, { subtask: 'technical_detail', accuracy: 72 }, { subtask: 'trend_analysis', accuracy: 70 }, { subtask: 'recommendation', accuracy: 74 }, { subtask: 'formatting', accuracy: 72 }] },
  { id: 'gemini-2.5-pro', provider: 'google', displayName: 'Gemini 2.5 Pro', pricing: { inputPer1M: 1.25, outputPer1M: 10 }, benchmarks: [{ subtask: 'triage', accuracy: 83 }, { subtask: 'extraction', accuracy: 90 }, { subtask: 'classification', accuracy: 89 }, { subtask: 'summarization', accuracy: 90 }, { subtask: 'translation', accuracy: 91 }, { subtask: 'risk_scoring', accuracy: 91 }, { subtask: 'context_gen', accuracy: 90 }, { subtask: 'attribution', accuracy: 88 }, { subtask: 'campaign_link', accuracy: 85 }, { subtask: 'false_positive', accuracy: 83 }, { subtask: 'exec_summary', accuracy: 90 }, { subtask: 'technical_detail', accuracy: 88 }, { subtask: 'trend_analysis', accuracy: 88 }, { subtask: 'recommendation', accuracy: 84 }, { subtask: 'formatting', accuracy: 82 }] },
  { id: 'gemini-2.5-flash', provider: 'google', displayName: 'Gemini 2.5 Flash', pricing: { inputPer1M: 0.15, outputPer1M: 0.6 }, benchmarks: [{ subtask: 'triage', accuracy: 75 }, { subtask: 'extraction', accuracy: 78 }, { subtask: 'classification', accuracy: 77 }, { subtask: 'summarization', accuracy: 76 }, { subtask: 'translation', accuracy: 79 }, { subtask: 'risk_scoring', accuracy: 76 }, { subtask: 'context_gen', accuracy: 74 }, { subtask: 'attribution', accuracy: 72 }, { subtask: 'campaign_link', accuracy: 70 }, { subtask: 'false_positive', accuracy: 74 }, { subtask: 'exec_summary', accuracy: 74 }, { subtask: 'technical_detail', accuracy: 72 }, { subtask: 'trend_analysis', accuracy: 70 }, { subtask: 'recommendation', accuracy: 72 }, { subtask: 'formatting', accuracy: 74 }] },
]

const PROVIDER_META: Record<AiProvider, { label: string; color: string; keyPrefix: string }> = {
  anthropic: { label: 'Anthropic', color: '#8b5cf6', keyPrefix: 'sk-ant-' },
  openai:    { label: 'OpenAI',    color: '#10b981', keyPrefix: 'sk-' },
  google:    { label: 'Google',    color: '#f59e0b', keyPrefix: 'AIza' },
}

function getAccuracy(modelId: string, subtask: string): number {
  const m = MODEL_CATALOG.find(m => m.id === modelId)
  return m?.benchmarks.find(b => b.subtask === subtask)?.accuracy ?? 0
}

function estimatePerItemCost(modelId: string, inputTokens = 1000, outputTokens = 300): number {
  const m = MODEL_CATALOG.find(m => m.id === modelId)
  if (!m) return 0
  return Math.round(((inputTokens * m.pricing.inputPer1M + outputTokens * m.pricing.outputPer1M) / 1_000_000) * 1_000_000) / 1_000_000
}

// ─── Types ──────────────────────────────────────────────────────

interface ConfigureTabProps {
  data: ReturnType<typeof useCommandCenter>
  aiConfig: ReturnType<typeof useGlobalAiConfig>
}

const PROVIDERS: { id: AiProvider; label: string; color: string; models: string[] }[] = [
  { id: 'anthropic', label: 'Anthropic', color: '#8b5cf6', models: ['Claude Opus 4.6', 'Claude Sonnet 4.6', 'Claude Haiku 4.5'] },
  { id: 'openai', label: 'OpenAI', color: '#10b981', models: ['o3', 'GPT-4o', 'o3-mini', 'GPT-4o Mini'] },
  { id: 'google', label: 'Google', color: '#f59e0b', models: ['Gemini 2.5 Pro', 'Gemini 2.5 Flash'] },
]

const CATEGORY_LABELS: Record<string, string> = {
  news_feed: 'News Feed Processing',
  ioc_enrichment: 'IOC Enrichment',
  reporting: 'Reporting',
}

function formatSubtask(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Provider Key Card ─────��────────────────────────────────────

function ProviderKeyCard({
  provider,
  providerKey,
  onSetKey,
  onTestKey,
  onRemoveKey,
  isSettingKey,
  isTestingKey,
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
    <div
      data-testid={`provider-card-${provider.id}`}
      className="p-4 bg-bg-elevated rounded-lg border border-border"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: provider.color }} />
          <span className="font-semibold text-text-primary text-sm">{provider.label}</span>
        </div>
        {hasKey && providerKey.isValid ? (
          <span className="flex items-center gap-1 text-xs text-sev-low">
            <CheckCircle className="w-3 h-3" /> Connected
          </span>
        ) : hasKey ? (
          <span className="flex items-center gap-1 text-xs text-sev-high">
            <XCircle className="w-3 h-3" /> Invalid
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <XCircle className="w-3 h-3" /> Not set
          </span>
        )}
      </div>

      {/* Key display / input */}
      {hasKey && !editing ? (
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-3 h-3 text-text-muted" />
          <code className="text-xs text-text-secondary font-mono flex-1">
            {showKey ? providerKey.keyMasked : '•'.repeat(20)}
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
            placeholder={`${meta.keyPrefix}•••••••••••`}
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

      {/* Actions */}
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

      {/* Test result */}
      {testResult && (
        <p className={cn('text-[10px] mt-2', testResult.success ? 'text-sev-low' : 'text-sev-high')}>
          {testResult.success ? 'Connection successful' : testResult.error ?? 'Connection failed'}
        </p>
      )}

      {/* Available models */}
      <p className="text-[10px] text-text-muted mt-3">
        {hasKey ? 'Models available: ' : 'Add key to unlock: '}{provider.models.join(', ')}
      </p>
    </div>
  )
}

// ─── Model Dropdown (grouped by provider) ───────────────────────

function ModelDropdown({
  currentModelId,
  subtask,
  providerKeys,
  onChange,
}: {
  currentModelId: string
  subtask: string
  providerKeys: { provider: string; isValid: boolean }[]
  onChange: (modelId: string) => void
}) {
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelDefinition[]> = {}
    for (const m of MODEL_CATALOG) {
      ;(groups[m.provider] ??= []).push(m)
    }
    return groups
  }, [])

  // Find best accuracy and best cost per subtask
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
          <optgroup key={provider} label={`── ${PROVIDER_META[provider as AiProvider]?.label ?? provider} ──`}>
            {models.map(m => {
              const acc = getAccuracy(m.id, subtask)
              const cost = estimatePerItemCost(m.id)
              const isBestAcc = m.id === bestAccuracyId
              const isBestCost = m.id === bestCostId
              const star = isBestAcc ? ' ★acc' : isBestCost ? ' ★cost' : ''
              return (
                <option key={m.id} value={m.id} disabled={!hasKey}>
                  {m.displayName} — {acc}% — ${cost.toFixed(4)}{star}{!hasKey ? ' (no key)' : ''}
                </option>
              )
            })}
          </optgroup>
        )
      })}
    </select>
  )
}

// ─── Configure Tab ──────────────────────────────────────────────

export function ConfigureTab({ data, aiConfig }: ConfigureTabProps) {
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})

  const config = aiConfig.config
  const subtasks = config?.subtasks ?? []

  const groupedSubtasks = useMemo(() => {
    const groups: Record<string, typeof subtasks> = {}
    for (const s of subtasks) {
      ;(groups[s.category] ??= []).push(s)
    }
    return groups
  }, [subtasks])

  const handleModelChange = (category: string, subtask: string, modelId: string) => {
    setPendingChanges(prev => ({ ...prev, [`${category}.${subtask}`]: modelId }))
  }

  const handleSaveAll = () => {
    for (const [key, modelId] of Object.entries(pendingChanges)) {
      const parts = key.split('.')
      const category = parts[0] ?? ''
      const subtask = parts[1] ?? ''
      // Map model ID to legacy model name for existing API
      const modelName = modelId.includes('haiku') ? 'haiku' : modelId.includes('opus') ? 'opus' : 'sonnet'
      aiConfig.setModel({ category, subtask, model: modelName as 'haiku' | 'sonnet' | 'opus' })
    }
    setPendingChanges({})
  }

  const hasPending = Object.keys(pendingChanges).length > 0

  const providerKeySummary = data.providerKeys.map(k => ({ provider: k.provider, isValid: k.isValid }))

  return (
    <div data-testid="configure-tab" className="space-y-8 max-w-6xl">
      {/* Section 1: Provider API Keys */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-purple-400" />
          Provider API Keys
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROVIDERS.map(p => {
            const keyStatus = data.providerKeys.find(k => k.provider === p.id) ?? {
              keyMasked: null, isValid: false, lastTested: null,
            }
            return (
              <ProviderKeyCard
                key={p.id}
                provider={p}
                providerKey={keyStatus}
                onSetKey={(provider, apiKey) => data.setProviderKey({ provider, apiKey })}
                onTestKey={(provider, apiKey) => data.testProviderKey({ provider, apiKey })}
                onRemoveKey={provider => data.removeProviderKey(provider)}
                isSettingKey={data.isSettingKey}
                isTestingKey={data.isTestingKey}
              />
            )
          })}
        </div>
      </section>

      {/* Section 2: Model Assignments */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Model Assignments</h2>
          <button
            data-testid="save-assignments-btn"
            onClick={handleSaveAll}
            disabled={!hasPending || aiConfig.isSavingModel}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              hasPending ? 'bg-brand text-white hover:bg-brand/90' : 'bg-bg-elevated text-text-muted cursor-not-allowed',
            )}
          >
            <Save className="w-4 h-4" /> Save Changes {hasPending && `(${Object.keys(pendingChanges).length})`}
          </button>
        </div>

        <p className="text-xs text-text-muted mb-3">
          Changes affect all tenants using the global processing pipeline.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="model-assignments-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3">Subtask</th>
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3">Accuracy</th>
                <th className="py-2 px-3">Cost/item</th>
                <th className="py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedSubtasks).map(([category, items]) =>
                items.map((s, idx) => {
                  const key = `${s.category}.${s.subtask}`
                  const currentModelId = pendingChanges[key] ?? `claude-${s.model === 'haiku' ? 'haiku-4-5' : s.model === 'opus' ? 'opus-4-6' : 'sonnet-4-6'}`
                  const acc = getAccuracy(currentModelId, s.subtask) || s.accuracyPct
                  const cost = estimatePerItemCost(currentModelId)
                  const accColor = acc >= 90 ? 'text-sev-low' : acc >= 80 ? 'text-sev-medium' : 'text-sev-high'

                  return (
                    <tr key={key} className="border-b border-border/50 hover:bg-bg-elevated/50">
                      <td className="py-2 px-3 text-text-muted text-xs">
                        {idx === 0 ? (CATEGORY_LABELS[category] ?? category) : ''}
                      </td>
                      <td className="py-2 px-3 text-text-primary text-xs">{formatSubtask(s.subtask)}</td>
                      <td className="py-2 px-3">
                        <ModelDropdown
                          currentModelId={currentModelId}
                          subtask={s.subtask}
                          providerKeys={providerKeySummary}
                          onChange={modelId => handleModelChange(s.category, s.subtask, modelId)}
                        />
                      </td>
                      <td className={cn('py-2 px-3 text-xs tabular-nums', accColor)}>{acc}%</td>
                      <td className="py-2 px-3 text-xs tabular-nums text-text-muted">${cost.toFixed(4)}</td>
                      <td className="py-2 px-3">
                        {pendingChanges[key] && (
                          <button
                            onClick={() => {
                              const next = { ...pendingChanges }
                              delete next[key]
                              setPendingChanges(next)
                            }}
                            className="text-text-muted hover:text-text-primary"
                            title="Reset"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Confidence Model Toggle */}
      <section data-testid="confidence-toggle-section">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Confidence Model
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['linear', 'bayesian'] as const).map(m => {
            const active = aiConfig.confidenceModel === m
            return (
              <button
                key={m}
                data-testid={`confidence-${m}`}
                onClick={() => aiConfig.setConfidenceModel(m)}
                disabled={aiConfig.isSavingConfidence}
                className={cn(
                  'p-4 rounded-lg border text-left transition-all',
                  active ? 'border-brand bg-brand/10' : 'border-border bg-bg-elevated hover:border-brand/30',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield className={cn('w-4 h-4', active ? 'text-brand' : 'text-text-muted')} />
                  <span className="font-semibold text-text-primary capitalize">{m}</span>
                  {active && (
                    <span className="text-xs bg-sev-low/20 text-sev-low px-2 py-0.5 rounded ml-auto">Active</span>
                  )}
                </div>
                <p className="text-text-muted text-xs">
                  {m === 'linear'
                    ? 'Simple weighted average. 0.35 feed + 0.35 corroboration + 0.30 AI'
                    : 'Log-odds model. High-reliability sources have multiplicative impact.'}
                </p>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
