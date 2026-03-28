/**
 * @module components/command-center/SettingsTab
 * @description Unified settings tab — merges former ConfigureTab (super-admin)
 * with tenant org-profile, alert sensitivity, notifications, onboarding.
 * Super-admin: AI Providers, Model Assignments, Confidence Model, Platform Prefs.
 * Tenant: Org Profile, Intelligence Quality, Alert Sensitivity, Notifications, Onboarding, Upgrade CTA.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import type { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import type {
  OrgProfile, Industry, AlertSensitivity,
  DigestFrequency, NotificationPrefs, OnboardingProgress,
} from '@/types/org-profile'
import {
  INDUSTRIES, BUSINESS_RISKS, ORG_SIZES, TECH_STACK_OPTIONS, DEMO_ORG_PROFILE,
} from '@/types/org-profile'
import {
  Key, CheckCircle, XCircle, Eye, EyeOff, Loader2, Save, RotateCcw, Shield,
  Building2, Cpu, AlertTriangle, Bell, Rocket, TrendingUp, ChevronRight,
  Clock, Mail, Volume2, VolumeX, Check, Circle,
} from 'lucide-react'
import { MiniSparkline } from './charts'

// ═══════════════════════════════════════════════════════════════
// SHARED: Model Catalog (same as former ConfigureTab)
// ═══════════════════════════════════════════════════════════════

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
  return MODEL_CATALOG.find(m => m.id === modelId)?.benchmarks.find(b => b.subtask === subtask)?.accuracy ?? 0
}

function estimatePerItemCost(modelId: string, inputTokens = 1000, outputTokens = 300): number {
  const m = MODEL_CATALOG.find(m => m.id === modelId)
  if (!m) return 0
  return Math.round(((inputTokens * m.pricing.inputPer1M + outputTokens * m.pricing.outputPer1M) / 1_000_000) * 1_000_000) / 1_000_000
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

// ═══════════════════════════════════════════════════════════════
// Provider Key Card (from ConfigureTab)
// ═══════════════════════════════════════════════════════════════

function ProviderKeyCard({
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

// ═══════════════════════════════════════════════════════════════
// Model Dropdown (from ConfigureTab)
// ═══════════════════════════════════════════════════════════════

function ModelDropdown({
  currentModelId, subtask, providerKeys, onChange,
}: {
  currentModelId: string; subtask: string
  providerKeys: { provider: string; isValid: boolean }[]
  onChange: (modelId: string) => void
}) {
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelDefinition[]> = {}
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

// ═══════════════════════════════════════════════════════════════
// SUPER-ADMIN VIEW
// ═══════════════════════════════════════════════════════════════

type AdminSection = 'providers' | 'models' | 'confidence' | 'platform'

const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'providers', label: 'AI Providers & Keys', icon: Key },
  { id: 'models', label: 'Model Assignments', icon: Cpu },
  { id: 'confidence', label: 'Confidence Model', icon: Shield },
  { id: 'platform', label: 'Platform Preferences', icon: Bell },
]

function SuperAdminSettings({ data, aiConfig }: SettingsTabProps) {
  const [section, setSection] = useState<AdminSection>('providers')
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})
  const [defaultSensitivity, setDefaultSensitivity] = useState<AlertSensitivity>('balanced')
  const [notifyOnOverLimit, setNotifyOnOverLimit] = useState(true)
  const [notifyOnProviderError, setNotifyOnProviderError] = useState(true)

  const config = aiConfig.config
  const subtasks = config?.subtasks ?? []

  const groupedSubtasks = useMemo(() => {
    const groups: Record<string, typeof subtasks> = {}
    for (const s of subtasks) { ;(groups[s.category] ??= []).push(s) }
    return groups
  }, [subtasks])

  const handleModelChange = (category: string, subtask: string, modelId: string) => {
    setPendingChanges(prev => ({ ...prev, [`${category}.${subtask}`]: modelId }))
  }

  const handleSaveAll = () => {
    for (const [key, modelId] of Object.entries(pendingChanges)) {
      const [category = '', subtask = ''] = key.split('.')
      const modelName = modelId.includes('haiku') ? 'haiku' : modelId.includes('opus') ? 'opus' : 'sonnet'
      aiConfig.setModel({ category, subtask, model: modelName as 'haiku' | 'sonnet' | 'opus' })
    }
    setPendingChanges({})
  }

  const hasPending = Object.keys(pendingChanges).length > 0
  const providerKeySummary = data.providerKeys.map(k => ({ provider: k.provider, isValid: k.isValid }))

  return (
    <div data-testid="settings-tab-admin" className="space-y-6 max-w-6xl">
      {/* Section pill switcher */}
      <div className="flex flex-wrap gap-2" data-testid="admin-section-pills">
        {ADMIN_SECTIONS.map(s => {
          const Icon = s.icon
          const active = section === s.id
          return (
            <button
              key={s.id}
              data-testid={`section-${s.id}`}
              onClick={() => setSection(s.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                active
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'bg-bg-elevated text-text-muted border border-border hover:text-text-primary',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          )
        })}
      </div>

      {/* AI Providers & Keys */}
      {section === 'providers' && (
        <section data-testid="section-providers-content">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" /> Provider API Keys
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
      )}

      {/* Model Assignments */}
      {section === 'models' && (
        <section data-testid="section-models-content">
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
          <p className="text-xs text-text-muted mb-3">Changes affect all tenants using the global processing pipeline.</p>
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
                        <td className="py-2 px-3 text-text-muted text-xs">{idx === 0 ? (CATEGORY_LABELS[category] ?? category) : ''}</td>
                        <td className="py-2 px-3 text-text-primary text-xs">{formatSubtask(s.subtask)}</td>
                        <td className="py-2 px-3">
                          <ModelDropdown currentModelId={currentModelId} subtask={s.subtask} providerKeys={providerKeySummary} onChange={modelId => handleModelChange(s.category, s.subtask, modelId)} />
                        </td>
                        <td className={cn('py-2 px-3 text-xs tabular-nums', accColor)}>{acc}%</td>
                        <td className="py-2 px-3 text-xs tabular-nums text-text-muted">${cost.toFixed(4)}</td>
                        <td className="py-2 px-3">
                          {pendingChanges[key] && (
                            <button onClick={() => { const next = { ...pendingChanges }; delete next[key]; setPendingChanges(next) }} className="text-text-muted hover:text-text-primary" title="Reset">
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
      )}

      {/* Confidence Model */}
      {section === 'confidence' && (
        <section data-testid="section-confidence-content">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" /> Confidence Model
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
                    {active && <span className="text-xs bg-sev-low/20 text-sev-low px-2 py-0.5 rounded ml-auto">Active</span>}
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
      )}

      {/* Platform Preferences */}
      {section === 'platform' && (
        <section data-testid="section-platform-content">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-400" /> Platform Preferences
          </h2>
          <div className="space-y-4 max-w-lg">
            <div className="p-4 bg-bg-elevated rounded-lg border border-border space-y-4">
              <h3 className="text-sm font-medium text-text-primary">Default Alert Sensitivity</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'balanced', 'aggressive'] as const).map(level => (
                  <button
                    key={level}
                    data-testid={`default-sensitivity-${level}`}
                    onClick={() => setDefaultSensitivity(level)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-center',
                      defaultSensitivity === level
                        ? 'border-brand bg-brand/10 text-accent'
                        : 'border-border bg-bg-primary text-text-muted hover:text-text-primary',
                    )}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted">Applied as default for new tenants.</p>
            </div>

            <div className="p-4 bg-bg-elevated rounded-lg border border-border space-y-3">
              <h3 className="text-sm font-medium text-text-primary">Global Notifications</h3>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-text-secondary">Notify on tenant over-limit</span>
                <button
                  data-testid="toggle-over-limit"
                  onClick={() => setNotifyOnOverLimit(!notifyOnOverLimit)}
                  className={cn('w-9 h-5 rounded-full transition-colors relative', notifyOnOverLimit ? 'bg-brand' : 'bg-bg-primary border border-border')}
                >
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', notifyOnOverLimit ? 'left-4' : 'left-0.5')} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-text-secondary">Notify on provider connection error</span>
                <button
                  data-testid="toggle-provider-error"
                  onClick={() => setNotifyOnProviderError(!notifyOnProviderError)}
                  className={cn('w-9 h-5 rounded-full transition-colors relative', notifyOnProviderError ? 'bg-brand' : 'bg-bg-primary border border-border')}
                >
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', notifyOnProviderError ? 'left-4' : 'left-0.5')} />
                </button>
              </label>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TENANT VIEW
// ═══════════════════════════════════════════════════════════════

const ALERT_SENSITIVITY_OPTIONS: { value: AlertSensitivity; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Only critical & high severity alerts. Fewer notifications, only confirmed threats.' },
  { value: 'balanced', label: 'Balanced', description: 'Critical, high, and medium severity. Good balance between noise and coverage.' },
  { value: 'aggressive', label: 'Aggressive', description: 'All severity levels including low. Maximum coverage, more notifications.' },
]

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: 'bg-text-muted/20 text-text-muted',
  starter: 'bg-sev-low/20 text-sev-low',
  teams: 'bg-accent/20 text-accent',
  enterprise: 'bg-purple-400/20 text-purple-400',
}

const PLAN_FEATURES = [
  { name: 'IOC Processing', free: '100/mo', starter: '10,000/mo', teams: '50,000/mo' },
  { name: 'AI Enrichment', free: 'None', starter: 'Basic', teams: 'Full' },
  { name: 'Alert Rules', free: '3', starter: '25', teams: 'Unlimited' },
  { name: 'Team Members', free: '1', starter: '5', teams: '25' },
  { name: 'Integrations', free: 'None', starter: '3', teams: 'Unlimited' },
]

function TenantSettings({ data }: { data: ReturnType<typeof useCommandCenter> }) {
  const plan = data.tenantPlan
  const isFree = plan === 'free'

  // Local state (would persist via API in production)
  const [orgProfile, setOrgProfile] = useState<OrgProfile>(DEMO_ORG_PROFILE)
  const [sensitivity, setSensitivity] = useState<AlertSensitivity>('balanced')
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    digestFrequency: 'daily', realTimeAlerts: true, quietHoursStart: '22:00', quietHoursEnd: '07:00',
  })
  const [onboarding] = useState<OnboardingProgress>({
    profile: true, firstFeed: true, inviteTeam: false, configureAlerts: false,
  })

  // Demo enrichment quality data
  const enrichmentAccuracy = 87
  const enrichedThisMonth = 3_200
  const accuracyTrend = [82, 84, 85, 83, 86, 87, 87]

  const onboardingSteps = [
    { key: 'profile', label: 'Complete org profile', done: onboarding.profile },
    { key: 'firstFeed', label: 'Add first feed', done: onboarding.firstFeed },
    { key: 'inviteTeam', label: 'Invite team members', done: onboarding.inviteTeam },
    { key: 'configureAlerts', label: 'Configure alerts', done: onboarding.configureAlerts },
  ]

  const completedSteps = onboardingSteps.filter(s => s.done).length

  return (
    <div data-testid="settings-tab-tenant" className="space-y-6 max-w-3xl">
      {/* ─── Org Profile ────────────────────────────────────────── */}
      <section data-testid="org-profile-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-400" /> Organization Profile
        </h2>

        <div className="space-y-4">
          {/* Industry */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Industry</label>
            <select
              data-testid="industry-select"
              value={orgProfile.industry}
              onChange={e => setOrgProfile(p => ({ ...p, industry: e.target.value as Industry }))}
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
            >
              {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>

          {/* Tech Stack (grouped chips) */}
          <div>
            <label className="text-xs text-text-muted block mb-2">Tech Stack</label>
            {(Object.entries(TECH_STACK_OPTIONS) as [keyof typeof TECH_STACK_OPTIONS, string[]][]).map(([group, options]) => (
              <div key={group} className="mb-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">{group}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {options.map(opt => {
                    const selected = orgProfile.techStack[group].includes(opt)
                    return (
                      <button
                        key={opt}
                        data-testid={`tech-${group}-${opt.replace(/\s/g, '-').toLowerCase()}`}
                        onClick={() => {
                          setOrgProfile(p => ({
                            ...p,
                            techStack: {
                              ...p.techStack,
                              [group]: selected
                                ? p.techStack[group].filter(v => v !== opt)
                                : [...p.techStack[group], opt],
                            },
                          }))
                        }}
                        className={cn(
                          'px-2 py-1 rounded text-[11px] font-medium transition-colors border',
                          selected
                            ? 'bg-accent/10 text-accent border-accent/30'
                            : 'bg-bg-primary text-text-muted border-border hover:text-text-primary',
                        )}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Business Risk */}
          <div>
            <label className="text-xs text-text-muted block mb-2">Business Risk Priorities</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BUSINESS_RISKS.map(risk => {
                const checked = orgProfile.businessRisk.includes(risk.value)
                return (
                  <label key={risk.value} className="flex items-center gap-2 cursor-pointer" data-testid={`risk-${risk.value}`}>
                    <button
                      onClick={() => {
                        setOrgProfile(p => ({
                          ...p,
                          businessRisk: checked
                            ? p.businessRisk.filter(r => r !== risk.value)
                            : [...p.businessRisk, risk.value],
                        }))
                      }}
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                        checked ? 'bg-brand border-brand' : 'border-border',
                      )}
                    >
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-xs text-text-secondary">{risk.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Org Size */}
          <div>
            <label className="text-xs text-text-muted block mb-2">Organization Size</label>
            <div className="grid grid-cols-2 gap-2">
              {ORG_SIZES.map(size => (
                <button
                  key={size.value}
                  data-testid={`size-${size.value}`}
                  onClick={() => setOrgProfile(p => ({ ...p, orgSize: size.value }))}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors',
                    orgProfile.orgSize === size.value
                      ? 'border-brand bg-brand/10 text-accent'
                      : 'border-border bg-bg-primary text-text-muted hover:text-text-primary',
                  )}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {/* Geography */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Country</label>
              <input
                data-testid="geography-country"
                type="text"
                value={orgProfile.geography.country}
                onChange={e => setOrgProfile(p => ({ ...p, geography: { ...p.geography, country: e.target.value } }))}
                className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
                placeholder="e.g. India"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Region</label>
              <input
                data-testid="geography-region"
                type="text"
                value={orgProfile.geography.region}
                onChange={e => setOrgProfile(p => ({ ...p, geography: { ...p.geography, region: e.target.value } }))}
                className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
                placeholder="e.g. Asia"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Intelligence Quality ───────────────────────────────── */}
      <section data-testid="intelligence-quality-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-sev-low" /> Intelligence Quality
        </h2>
        <div className="flex items-center gap-6">
          {/* Accuracy gauge */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-primary)" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={enrichmentAccuracy >= 85 ? 'var(--sev-low)' : enrichmentAccuracy >= 70 ? 'var(--sev-medium)' : 'var(--sev-high)'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(enrichmentAccuracy / 100) * 213.6} 213.6`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-text-primary">{enrichmentAccuracy}%</span>
            </div>
            <span className="text-[10px] text-text-muted mt-1">Accuracy</span>
          </div>

          {/* Trend sparkline + counter */}
          <div className="flex-1 space-y-2">
            <div>
              <span className="text-[10px] text-text-muted">Accuracy Trend (7d)</span>
              <MiniSparkline values={accuracyTrend} height={24} width={120} />
            </div>
            <div>
              <span className="text-[10px] text-text-muted block">Items enriched this month</span>
              <span className="text-sm font-semibold text-text-primary tabular-nums">{enrichedThisMonth.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Alert Sensitivity ──────────────────────────────────── */}
      <section data-testid="alert-sensitivity-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-sev-medium" /> Alert Sensitivity
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ALERT_SENSITIVITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              data-testid={`sensitivity-${opt.value}`}
              onClick={() => setSensitivity(opt.value)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                sensitivity === opt.value
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-bg-primary hover:border-brand/30',
              )}
            >
              <span className="text-xs font-semibold text-text-primary">{opt.label}</span>
              <p className="text-[10px] text-text-muted mt-1">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Notifications ──────────────────────────────────────── */}
      <section data-testid="notifications-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" /> Notifications
        </h2>
        <div className="space-y-4">
          {/* Email digest */}
          <div>
            <label className="text-xs text-text-muted block mb-2">Email Digest</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'off'] as DigestFrequency[]).map(freq => (
                <button
                  key={freq}
                  data-testid={`digest-${freq}`}
                  onClick={() => setNotifications(n => ({ ...n, digestFrequency: freq }))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    notifications.digestFrequency === freq
                      ? 'border-brand bg-brand/10 text-accent'
                      : 'border-border text-text-muted hover:text-text-primary',
                  )}
                >
                  {freq === 'off' ? 'Off' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Real-time alerts toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              {notifications.realTimeAlerts ? <Volume2 className="w-3.5 h-3.5 text-sev-low" /> : <VolumeX className="w-3.5 h-3.5 text-text-muted" />}
              <span className="text-xs text-text-secondary">Real-time alerts</span>
            </div>
            <button
              data-testid="toggle-realtime"
              onClick={() => setNotifications(n => ({ ...n, realTimeAlerts: !n.realTimeAlerts }))}
              className={cn('w-9 h-5 rounded-full transition-colors relative', notifications.realTimeAlerts ? 'bg-brand' : 'bg-bg-primary border border-border')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', notifications.realTimeAlerts ? 'left-4' : 'left-0.5')} />
            </button>
          </label>

          {/* Quiet hours */}
          <div>
            <label className="text-xs text-text-muted block mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Quiet Hours
            </label>
            <div className="flex items-center gap-2">
              <input
                data-testid="quiet-start"
                type="time"
                value={notifications.quietHoursStart}
                onChange={e => setNotifications(n => ({ ...n, quietHoursStart: e.target.value }))}
                className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary"
              />
              <span className="text-xs text-text-muted">to</span>
              <input
                data-testid="quiet-end"
                type="time"
                value={notifications.quietHoursEnd}
                onChange={e => setNotifications(n => ({ ...n, quietHoursEnd: e.target.value }))}
                className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Onboarding ─────────────────────────────────────────── */}
      <section data-testid="onboarding-section" className="p-4 bg-bg-elevated rounded-lg border border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Rocket className="w-4 h-4 text-accent" /> Setup Progress
        </h2>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">{completedSteps} of {onboardingSteps.length} complete</span>
            <span className="text-xs font-semibold text-text-primary">{Math.round((completedSteps / onboardingSteps.length) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          {onboardingSteps.map(step => (
            <div key={step.key} className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle className="w-4 h-4 text-sev-low shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-text-muted shrink-0" />
              )}
              <span className={cn('text-xs', step.done ? 'text-text-secondary line-through' : 'text-text-primary')}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
        {completedSteps < onboardingSteps.length && (
          <button
            data-testid="resume-wizard-btn"
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            <ChevronRight className="w-3 h-3" /> Resume Setup Wizard
          </button>
        )}
      </section>

      {/* ─── Upgrade CTA (free only) ───────────────────────────── */}
      {isFree && (
        <section data-testid="upgrade-cta-section" className="p-4 bg-gradient-to-br from-purple-400/10 to-accent/10 rounded-lg border border-purple-400/30">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-semibold text-text-primary">Upgrade Your Plan</h2>
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', PLAN_BADGE_COLORS[plan])}>
              {plan}
            </span>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Unlock AI enrichment, more team members, and advanced integrations.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="plan-comparison-table">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="py-2 px-2 text-left">Feature</th>
                  <th className="py-2 px-2 text-center">Free</th>
                  <th className="py-2 px-2 text-center">Starter</th>
                  <th className="py-2 px-2 text-center">Teams</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map(f => (
                  <tr key={f.name} className="border-b border-border/50">
                    <td className="py-1.5 px-2 text-text-secondary">{f.name}</td>
                    <td className="py-1.5 px-2 text-center text-text-muted">{f.free}</td>
                    <td className="py-1.5 px-2 text-center text-sev-low">{f.starter}</td>
                    <td className="py-1.5 px-2 text-center text-accent font-medium">{f.teams}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            data-testid="upgrade-btn"
            className="mt-4 w-full py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand/90 transition-colors"
          >
            Upgrade Now
          </button>
        </section>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

interface SettingsTabProps {
  data: ReturnType<typeof useCommandCenter>
  aiConfig: ReturnType<typeof useGlobalAiConfig>
}

export function SettingsTab({ data, aiConfig }: SettingsTabProps) {
  return data.isSuperAdmin
    ? <SuperAdminSettings data={data} aiConfig={aiConfig} />
    : <TenantSettings data={data} />
}
