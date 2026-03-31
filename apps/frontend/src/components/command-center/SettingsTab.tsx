/**
 * @module components/command-center/SettingsTab
 * @description Unified settings tab — role-switched view.
 * Super-admin: AI Providers, Model Assignments, Confidence & Preferences (merged), Security.
 * Tenant: Org Profile, Intelligence Quality, Alert Sensitivity, Notifications, Onboarding, Upgrade CTA.
 *
 * S123b: Confidence Model + Platform Preferences merged into single widget-card section.
 * Feed-related model assignments (news_feed) moved to SystemTab → Feed Config sub-tab.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import type { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import type { AlertSensitivity } from '@/types/org-profile'
import { Key, Cpu, Shield, Bell, Save, RotateCcw } from 'lucide-react'
import { MfaEnforcementCard } from '@/components/security/SecurityPanel'
import { ProviderKeyCard, ModelDropdown } from './SettingsProviders'
import { TenantSettings } from './TenantSettings'
import {
  PROVIDERS, CATEGORY_LABELS, getAccuracy, estimatePerItemCost, formatSubtask,
} from './settings-data'

// ═══════════════════════════════════════════════════════════════
// SUPER-ADMIN VIEW
// ═══════════════════════════════════════════════════════════════

type AdminSection = 'providers' | 'models' | 'preferences' | 'security'

const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'providers', label: 'AI Providers & Keys', icon: Key },
  { id: 'models', label: 'Model Assignments', icon: Cpu },
  { id: 'preferences', label: 'Confidence & Preferences', icon: Shield },
  { id: 'security', label: 'Security & MFA', icon: Shield },
]

function SuperAdminSettings({ data, aiConfig }: SettingsTabProps) {
  const [section, setSection] = useState<AdminSection>('providers')
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})
  const [defaultSensitivity, setDefaultSensitivity] = useState<AlertSensitivity>('balanced')
  const [notifyOnOverLimit, setNotifyOnOverLimit] = useState(true)
  const [notifyOnProviderError, setNotifyOnProviderError] = useState(true)

  const config = aiConfig.config
  const subtasks = config?.subtasks ?? []

  // Filter out news_feed — moved to SystemTab → Feed Config
  const nonFeedSubtasks = useMemo(() =>
    subtasks.filter(s => s.category !== 'news_feed'),
  [subtasks])

  const groupedSubtasks = useMemo(() => {
    const groups: Record<string, typeof nonFeedSubtasks> = {}
    for (const s of nonFeedSubtasks) { ;(groups[s.category] ??= []).push(s) }
    return groups
  }, [nonFeedSubtasks])

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

      {/* Model Assignments (excludes news_feed — see SystemTab Feed Config) */}
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
          <p className="text-xs text-text-muted mb-3">Changes affect all tenants using the global processing pipeline. Feed model assignments are in System → Feed Config.</p>
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

      {/* Confidence & Preferences (merged from former Confidence Model + Platform Preferences) */}
      {section === 'preferences' && (
        <section data-testid="section-preferences-content" className="space-y-6">
          {/* Confidence Model widget card */}
          <div className="p-4 bg-bg-elevated rounded-lg border border-border" data-testid="section-confidence-content">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" /> Confidence Model
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      active ? 'border-brand bg-brand/10' : 'border-border bg-bg-primary hover:border-brand/30',
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
          </div>

          {/* Platform Preferences widget card */}
          <div className="p-4 bg-bg-elevated rounded-lg border border-border" data-testid="section-platform-content">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-400" /> Platform Preferences
            </h3>
            <div className="space-y-4 max-w-lg">
              <div className="p-3 bg-bg-primary rounded-lg border border-border space-y-3">
                <h4 className="text-xs font-medium text-text-primary">Default Alert Sensitivity</h4>
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
                          : 'border-border bg-bg-elevated text-text-muted hover:text-text-primary',
                      )}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted">Applied as default for new tenants.</p>
              </div>

              <div className="p-3 bg-bg-primary rounded-lg border border-border space-y-3">
                <h4 className="text-xs font-medium text-text-primary">Global Notifications</h4>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-text-secondary">Notify on tenant over-limit</span>
                  <button
                    data-testid="toggle-over-limit"
                    onClick={() => setNotifyOnOverLimit(!notifyOnOverLimit)}
                    className={cn('w-9 h-5 rounded-full transition-colors relative', notifyOnOverLimit ? 'bg-brand' : 'bg-bg-elevated border border-border')}
                  >
                    <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', notifyOnOverLimit ? 'left-4' : 'left-0.5')} />
                  </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-text-secondary">Notify on provider connection error</span>
                  <button
                    data-testid="toggle-provider-error"
                    onClick={() => setNotifyOnProviderError(!notifyOnProviderError)}
                    className={cn('w-9 h-5 rounded-full transition-colors relative', notifyOnProviderError ? 'bg-brand' : 'bg-bg-elevated border border-border')}
                  >
                    <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', notifyOnProviderError ? 'left-4' : 'left-0.5')} />
                  </button>
                </label>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Security & MFA Enforcement */}
      {section === 'security' && (
        <section data-testid="section-security-content">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" /> Security & MFA Enforcement
          </h2>
          <div className="max-w-lg">
            <MfaEnforcementCard scope="platform" />
          </div>
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
