/**
 * @module pages/CustomizationPage
 * @description Platform Customization dashboard — module toggles, AI model config,
 * risk weight tuning, dashboard preferences, notification channel routing.
 * 5 tabs with interactive config panels.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useModuleToggles, useAIConfigs, useRiskWeights,
  useNotificationChannels, useCustomizationStats,
  useToggleModule, useUpdateAIConfig, useUpdateRiskWeight,
  useResetRiskWeights, useUpdateNotificationChannel, useTestNotification,
  type ModuleToggle, type AIModelConfig, type RiskWeight, type NotificationChannel,
} from '@/hooks/use-phase5-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  Puzzle, Brain, Scale, LayoutDashboard, Bell,
  ToggleLeft, ToggleRight, AlertTriangle, Send,
  RotateCcw, DollarSign, Sliders,
} from 'lucide-react'

// ─── Tab type ───────────────────────────────────────────────────

type CustomTab = 'modules' | 'ai' | 'risk' | 'dashboard' | 'notifications'

const TABS: { key: CustomTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'modules', label: 'Modules', icon: Puzzle },
  { key: 'ai', label: 'AI Config', icon: Brain },
  { key: 'risk', label: 'Risk Weights', icon: Scale },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'notifications', label: 'Notifications', icon: Bell },
]

// ─── Main Component ─────────────────────────────────────────────

export function CustomizationPage() {
  const [activeTab, setActiveTab] = useState<CustomTab>('modules')

  const { data: stats, isDemo } = useCustomizationStats()
  const { data: moduleData } = useModuleToggles()
  const { data: aiData } = useAIConfigs()
  const { data: riskData } = useRiskWeights()
  const { data: notifData } = useNotificationChannels()

  return (
    <div className="flex flex-col h-full">
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-400/10 text-rose-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Customization service for live config</span>
        </div>
      )}

      <PageStatsBar>
        <CompactStat label="Modules Enabled" value={stats?.modulesEnabled?.toString() ?? '—'} />
        <CompactStat label="Custom Rules" value={stats?.customRules?.toString() ?? '0'} />
        <CompactStat label="AI Budget Used" value={`${stats?.aiBudgetUsed ?? 0}%`} color={
          (stats?.aiBudgetUsed ?? 0) >= 80 ? 'text-sev-critical' : (stats?.aiBudgetUsed ?? 0) >= 50 ? 'text-sev-medium' : 'text-sev-low'
        } />
        <CompactStat label="Theme" value={stats?.theme ?? 'dark'} />
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === key ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary')}>
              <Icon className="w-3 h-3" />{label}
            </button>
          ))}
        </div>

        {activeTab === 'modules' && <ModulesTab modules={moduleData?.data ?? []} isDemo={isDemo} />}
        {activeTab === 'ai' && <AIConfigTab configs={aiData?.data ?? []} isDemo={isDemo} />}
        {activeTab === 'risk' && <RiskWeightsTab weights={riskData?.data ?? []} isDemo={isDemo} />}
        {activeTab === 'dashboard' && <DashboardConfigTab />}
        {activeTab === 'notifications' && <NotificationsTab channels={notifData?.data ?? []} isDemo={isDemo} />}
      </div>
    </div>
  )
}

// ─── Modules Tab ────────────────────────────────────────────────

function ModulesTab({ modules, isDemo }: { modules: ModuleToggle[]; isDemo: boolean }) {
  const toggleMutation = useToggleModule()

  const categories = useMemo(() => {
    const map = new Map<string, ModuleToggle[]>()
    modules.forEach(m => {
      const list = map.get(m.category) ?? []
      list.push(m)
      map.set(m.category, list)
    })
    return Array.from(map.entries())
  }, [modules])

  return (
    <div className="space-y-4">
      {categories.map(([category, mods]) => (
        <div key={category}>
          <h3 className="text-[10px] text-text-muted uppercase font-medium mb-2">{category}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mods.map(mod => (
              <div key={mod.id} className="p-3 bg-bg-secondary rounded-lg border border-border flex items-start gap-3">
                <button
                  onClick={() => !isDemo && toggleMutation.mutate({ id: mod.id, enabled: !mod.enabled })}
                  disabled={isDemo || toggleMutation.isPending}
                  className="mt-0.5 shrink-0">
                  {mod.enabled
                    ? <ToggleRight className="w-5 h-5 text-sev-low" />
                    : <ToggleLeft className="w-5 h-5 text-text-muted" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', mod.enabled ? 'text-text-primary' : 'text-text-muted')}>{mod.name}</span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">{mod.description}</p>
                  {mod.dependencies.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-sev-medium shrink-0" />
                      <span className="text-[10px] text-sev-medium">Requires: {mod.dependencies.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── AI Config Tab ──────────────────────────────────────────────

function AIConfigTab({ configs, isDemo }: { configs: AIModelConfig[]; isDemo: boolean }) {
  const updateMutation = useUpdateAIConfig()

  const totalBudget = configs.reduce((sum, c) => sum + c.monthlyBudget, 0)
  const totalSpent = configs.reduce((sum, c) => sum + c.spent, 0)

  return (
    <div className="space-y-4">
      {/* Budget overview */}
      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-text-primary">Monthly AI Budget</h3>
          <span className="text-xs text-text-muted">${totalSpent.toFixed(2)} / ${totalBudget.toFixed(2)}</span>
        </div>
        <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%`,
              backgroundColor: totalSpent / totalBudget >= 0.8 ? 'var(--sev-critical)' : totalSpent / totalBudget >= 0.5 ? 'var(--sev-medium)' : 'var(--sev-low)',
            }} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
          <span><DollarSign className="w-3 h-3 inline" /> {((totalSpent / totalBudget) * 100).toFixed(1)}% used</span>
          <span>${(totalBudget - totalSpent).toFixed(2)} remaining</span>
        </div>
      </div>

      {/* Per-task configs */}
      <div className="space-y-3">
        {configs.map(config => (
          <div key={config.id} className="p-3 bg-bg-secondary rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Brain className={cn('w-4 h-4', config.enabled ? 'text-accent' : 'text-text-muted')} />
                <span className="text-xs font-medium text-text-primary">{config.task}</span>
              </div>
              <button
                onClick={() => !isDemo && updateMutation.mutate({ id: config.id, enabled: !config.enabled })}
                disabled={isDemo || updateMutation.isPending}>
                {config.enabled
                  ? <ToggleRight className="w-5 h-5 text-sev-low" />
                  : <ToggleLeft className="w-5 h-5 text-text-muted" />}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div>
                <span className="text-text-muted">Model</span>
                <p className="text-text-primary font-mono">{config.model}</p>
              </div>
              <div>
                <span className="text-text-muted">Max Tokens</span>
                <p className="text-text-primary tabular-nums">{config.maxTokens.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-text-muted">Budget</span>
                <p className="text-text-primary tabular-nums">${config.spent.toFixed(2)} / ${config.monthlyBudget}</p>
              </div>
              <div>
                <span className="text-text-muted">Confidence</span>
                <p className="text-text-primary tabular-nums">{(config.confidenceThreshold * 100).toFixed(0)}%</p>
              </div>
            </div>
            {/* Budget bar per task */}
            <div className="mt-2 w-full h-1 bg-bg-elevated rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (config.spent / config.monthlyBudget) * 100)}%`,
                  backgroundColor: config.spent / config.monthlyBudget >= 0.8 ? 'var(--sev-critical)' : 'var(--accent)',
                }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Risk Weights Tab ───────────────────────────────────────────

function RiskWeightsTab({ weights, isDemo }: { weights: RiskWeight[]; isDemo: boolean }) {
  const updateMutation = useUpdateRiskWeight()
  const resetMutation = useResetRiskWeights()
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({})

  const getWeight = (w: RiskWeight) => localWeights[w.id] ?? w.weight
  const totalWeight = weights.reduce((sum, w) => sum + getWeight(w), 0)

  const handleChange = (w: RiskWeight, val: number) => {
    setLocalWeights(prev => ({ ...prev, [w.id]: val }))
  }

  const handleSave = (w: RiskWeight) => {
    const val = localWeights[w.id]
    if (val != null && val !== w.weight && !isDemo) {
      updateMutation.mutate({ id: w.id, weight: val })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-text-primary">Risk Score Weights</h3>
          <p className="text-[10px] text-text-muted mt-0.5">Adjust how each factor contributes to composite risk scores. Weights should sum to 1.0.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs tabular-nums font-medium',
            Math.abs(totalWeight - 1) < 0.01 ? 'text-sev-low' : 'text-sev-critical')}>
            Total: {totalWeight.toFixed(2)}
          </span>
          <button onClick={() => { setLocalWeights({}); !isDemo && resetMutation.mutate() }}
            disabled={isDemo || resetMutation.isPending}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-bg-elevated text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {weights.map(w => {
          const val = getWeight(w)
          return (
            <div key={w.id} className="p-3 bg-bg-secondary rounded-lg border border-border">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs font-medium text-text-primary">{w.factor}</span>
                  <p className="text-[10px] text-text-muted">{w.description}</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-accent">{val.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-text-muted tabular-nums w-6">{w.min}</span>
                <input type="range" min={w.min} max={w.max} step={0.01} value={val}
                  onChange={e => handleChange(w, parseFloat(e.target.value))}
                  onMouseUp={() => handleSave(w)} onTouchEnd={() => handleSave(w)}
                  className="flex-1 h-1 accent-[var(--accent)]" disabled={isDemo} />
                <span className="text-[10px] text-text-muted tabular-nums w-6">{w.max}</span>
              </div>
              {val !== w.default && (
                <div className="text-[10px] text-sev-medium mt-1">
                  Default: {w.default.toFixed(2)} (changed by {((val - w.default) * 100).toFixed(0)}%)
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Preview Panel */}
      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <h3 className="text-[10px] text-text-muted uppercase font-medium mb-2">Score Preview</h3>
        <p className="text-[10px] text-text-muted mb-2">Sample IOC with all factors at 0.8:</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums text-text-primary">
            {(weights.reduce((sum, w) => sum + getWeight(w) * 0.8, 0) * 100).toFixed(0)}
          </span>
          <span className="text-[10px] text-text-muted">/ 100 composite score</span>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard Config Tab ───────────────────────────────────────

function DashboardConfigTab() {
  const [refreshInterval, setRefreshInterval] = useState('300')
  const [defaultDashboard, setDefaultDashboard] = useState('overview')

  return (
    <div className="space-y-4">
      <div className="p-4 bg-bg-secondary rounded-lg border border-border space-y-3">
        <h3 className="text-xs font-semibold text-text-primary">Dashboard Preferences</h3>

        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">Default Dashboard</label>
          <select className="w-full px-3 py-2 text-xs bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            value={defaultDashboard} onChange={e => setDefaultDashboard(e.target.value)}>
            <option value="overview">Overview Dashboard</option>
            <option value="soc">SOC Operations</option>
            <option value="threat-intel">Threat Intelligence</option>
            <option value="executive">Executive Summary</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">Refresh Interval</label>
          <select className="w-full px-3 py-2 text-xs bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            value={refreshInterval} onChange={e => setRefreshInterval(e.target.value)}>
            <option value="60">Every minute</option>
            <option value="300">Every 5 minutes</option>
            <option value="900">Every 15 minutes</option>
            <option value="3600">Every hour</option>
            <option value="0">Manual only</option>
          </select>
        </div>
      </div>

      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <h3 className="text-xs font-semibold text-text-primary mb-2">Widget Layout</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {['IOC Summary', 'Alert Feed', 'Risk Score', 'Feed Status', 'AI Cost', 'Recent Activity'].map(widget => (
            <div key={widget} className="p-3 bg-bg-primary rounded border border-border border-dashed text-center">
              <Sliders className="w-4 h-4 mx-auto text-text-muted mb-1" />
              <span className="text-[10px] text-text-muted">{widget}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-2">Drag-and-drop layout editor coming in Phase 6.</p>
      </div>
    </div>
  )
}

// ─── Notifications Tab ──────────────────────────────────────────

function NotificationsTab({ channels, isDemo }: { channels: NotificationChannel[]; isDemo: boolean }) {
  const updateMutation = useUpdateNotificationChannel()
  const testMutation = useTestNotification()

  const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low']

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-text-primary">Alert Channels</h3>
        <p className="text-[10px] text-text-muted mt-0.5">Configure where and when notifications are delivered.</p>
      </div>

      {channels.map(ch => (
        <div key={ch.id} className="p-3 bg-bg-secondary rounded-lg border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-accent bg-accent/10 uppercase">{ch.type}</span>
              <span className="text-xs font-medium text-text-primary">{ch.name}</span>
            </div>
            <button
              onClick={() => !isDemo && updateMutation.mutate({ id: ch.id, enabled: !ch.enabled })}
              disabled={isDemo || updateMutation.isPending}>
              {ch.enabled
                ? <ToggleRight className="w-5 h-5 text-sev-low" />
                : <ToggleLeft className="w-5 h-5 text-text-muted" />}
            </button>
          </div>

          {/* Severity routing */}
          <div className="space-y-1">
            <span className="text-[10px] text-text-muted">Severity Routing</span>
            <div className="flex items-center gap-1.5">
              {SEVERITY_OPTIONS.map(sev => (
                <button key={sev} type="button"
                  onClick={() => {
                    if (isDemo) return
                    const newSevs = ch.severities.includes(sev)
                      ? ch.severities.filter(s => s !== sev)
                      : [...ch.severities, sev]
                    updateMutation.mutate({ id: ch.id, severities: newSevs })
                  }}
                  disabled={isDemo || updateMutation.isPending}
                  className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                    ch.severities.includes(sev)
                      ? sev === 'critical' ? 'bg-sev-critical/10 text-sev-critical border-sev-critical/30'
                        : sev === 'high' ? 'bg-sev-high/10 text-sev-high border-sev-high/30'
                        : sev === 'medium' ? 'bg-sev-medium/10 text-sev-medium border-sev-medium/30'
                        : 'bg-sev-low/10 text-sev-low border-sev-low/30'
                      : 'bg-bg-elevated text-text-muted border-border')}>
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Quiet hours */}
          {(ch.quietHoursStart || ch.quietHoursEnd) && (
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <span>Quiet hours: {ch.quietHoursStart} — {ch.quietHoursEnd}</span>
            </div>
          )}

          {/* Test button */}
          <button
            onClick={() => !isDemo && testMutation.mutate(ch.id)}
            disabled={isDemo || testMutation.isPending || !ch.enabled}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
            <Send className="w-3 h-3" />
            {testMutation.isPending ? 'Sending…' : 'Test Notification'}
          </button>
        </div>
      ))}
    </div>
  )
}
