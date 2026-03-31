/**
 * @module components/command-center/FeedConfigPanel
 * @description Feed model assignment panel — moved from Settings tab to System tab (S123b).
 * Shows news_feed category subtask model assignments.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Save, RotateCcw, Rss } from 'lucide-react'
import type { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import type { useCommandCenter } from '@/hooks/use-command-center'
import { ModelDropdown } from './SettingsProviders'
import { CATEGORY_LABELS, getAccuracy, estimatePerItemCost, formatSubtask } from './settings-data'

interface FeedConfigPanelProps {
  aiConfig: ReturnType<typeof useGlobalAiConfig>
  providerKeys: ReturnType<typeof useCommandCenter>['providerKeys']
}

export function FeedConfigPanel({ aiConfig, providerKeys }: FeedConfigPanelProps) {
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})

  const config = aiConfig.config
  const subtasks = config?.subtasks ?? []

  const feedSubtasks = useMemo(() =>
    subtasks.filter(s => s.category === 'news_feed'),
  [subtasks])

  const providerKeySummary = providerKeys.map(k => ({ provider: k.provider, isValid: k.isValid }))

  const handleModelChange = (subtask: string, modelId: string) => {
    setPendingChanges(prev => ({ ...prev, [`news_feed.${subtask}`]: modelId }))
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

  return (
    <div className="space-y-4" data-testid="feed-config-subtab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Rss className="w-4 h-4 text-accent" /> Feed Processing Models
          </h3>
          <p className="text-xs text-text-muted mt-1">
            AI model assignments for {CATEGORY_LABELS['news_feed'] ?? 'News Feed Processing'} pipeline tasks.
          </p>
        </div>
        <button
          data-testid="save-feed-assignments-btn"
          onClick={handleSaveAll}
          disabled={!hasPending || aiConfig.isSavingModel}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            hasPending ? 'bg-brand text-white hover:bg-brand/90' : 'bg-bg-elevated text-text-muted cursor-not-allowed',
          )}
        >
          <Save className="w-3.5 h-3.5" /> Save {hasPending && `(${Object.keys(pendingChanges).length})`}
        </button>
      </div>

      {feedSubtasks.length === 0 ? (
        <p className="text-xs text-text-muted p-3 bg-bg-elevated rounded-lg border border-border">
          No feed processing subtasks configured. Add feed subtasks via the AI config API.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="feed-assignments-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 px-3">Subtask</th>
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3">Accuracy</th>
                <th className="py-2 px-3">Cost/item</th>
                <th className="py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {feedSubtasks.map(s => {
                const key = `news_feed.${s.subtask}`
                const currentModelId = pendingChanges[key] ?? `claude-${s.model === 'haiku' ? 'haiku-4-5' : s.model === 'opus' ? 'opus-4-6' : 'sonnet-4-6'}`
                const acc = getAccuracy(currentModelId, s.subtask) || s.accuracyPct
                const cost = estimatePerItemCost(currentModelId)
                const accColor = acc >= 90 ? 'text-sev-low' : acc >= 80 ? 'text-sev-medium' : 'text-sev-high'
                return (
                  <tr key={key} className="border-b border-border/50 hover:bg-bg-elevated/50">
                    <td className="py-2 px-3 text-text-primary text-xs">{formatSubtask(s.subtask)}</td>
                    <td className="py-2 px-3">
                      <ModelDropdown
                        currentModelId={currentModelId}
                        subtask={s.subtask}
                        providerKeys={providerKeySummary}
                        onChange={modelId => handleModelChange(s.subtask, modelId)}
                      />
                    </td>
                    <td className={cn('py-2 px-3 text-xs tabular-nums', accColor)}>{acc}%</td>
                    <td className="py-2 px-3 text-xs tabular-nums text-text-muted">${cost.toFixed(4)}</td>
                    <td className="py-2 px-3">
                      {pendingChanges[key] && (
                        <button
                          onClick={() => { const next = { ...pendingChanges }; delete next[key]; setPendingChanges(next) }}
                          className="text-text-muted hover:text-text-primary"
                          title="Reset"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
