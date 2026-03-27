/**
 * @module components/FeedSelectionStep
 * @description Onboarding wizard feed selection step — global feed grid,
 * private feed form, alert preferences. Shown during 'feed_activation' step.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useOnboardingFeeds, type AlertConfig } from '@/hooks/use-onboarding-feeds'
import { CheckCircle2, Rss, Shield, Lock, Plus, X, Zap } from 'lucide-react'

const FEED_TYPE_ICONS: Record<string, typeof Rss> = {
  rss: Rss, nvd: Shield, rest: Zap, stix: Shield, misp: Shield,
}

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical only' },
  { value: 'high', label: 'High+' },
  { value: 'medium', label: 'Medium+' },
  { value: 'low', label: 'All' },
]

const IOC_TYPE_OPTIONS = ['ip', 'domain', 'hash', 'cve', 'url', 'email']

export function FeedSelectionStep({ planTier, onContinue, onSkip }: {
  planTier: string
  onContinue: () => void
  onSkip: () => void
}) {
  const {
    eligibleFeeds, lockedFeeds, selectedFeedIds, toggleFeed,
    selectAll, deselectAll, privateFeeds, addPrivateFeed, removePrivateFeed,
    testFeed, alertConfig, setAlertConfig, maxGlobal, maxPrivate, isLoading,
  } = useOnboardingFeeds(planTier)

  const [showAddFeed, setShowAddFeed] = useState(false)
  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedType, setNewFeedType] = useState<'rss' | 'rest_api'>('rss')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const handleTestFeed = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testFeed(newFeedUrl, newFeedType)
    setTestResult(result.valid ? `Valid feed: ${result.feedTitle ?? 'OK'} (${result.articleCount ?? '?'} items)` : `Invalid: ${result.error}`)
    setTesting(false)
  }

  const handleAddFeed = () => {
    if (!newFeedName || !newFeedUrl) return
    addPrivateFeed({ name: newFeedName, url: newFeedUrl, feedType: newFeedType })
    setNewFeedName('')
    setNewFeedUrl('')
    setTestResult(null)
    setShowAddFeed(false)
  }

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-text-muted">Loading feed catalog...</div>
  }

  return (
    <div className="space-y-6">
      {/* Section A: Global Feeds */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Global Feeds</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted">{selectedFeedIds.size}/{maxGlobal === Infinity ? '∞' : maxGlobal} selected</span>
            <button onClick={selectAll} className="text-[10px] text-accent hover:underline">Select All</button>
            <button onClick={deselectAll} className="text-[10px] text-text-muted hover:underline">Deselect All</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="global-feed-grid">
          {eligibleFeeds.map(feed => {
            const isSelected = selectedFeedIds.has(feed.id)
            const Icon = FEED_TYPE_ICONS[feed.feedType] ?? Rss
            return (
              <button
                key={feed.id}
                onClick={() => toggleFeed(feed.id)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                    : 'border-border-subtle bg-bg-elevated hover:border-accent/30',
                )}
                data-testid={`feed-card-${feed.id}`}
              >
                <Icon className="w-4 h-4 shrink-0 text-text-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{feed.name}</p>
                  <p className="text-[10px] text-text-muted">{feed.feedType} · {feed.sourceReliability ?? 'C'}</p>
                </div>
                <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                  isSelected ? 'border-accent bg-accent' : 'border-border-subtle',
                )}>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
              </button>
            )
          })}
          {lockedFeeds.map(feed => (
            <div key={feed.id} className="flex items-center gap-3 p-3 rounded-lg border border-border-subtle/50 bg-bg-primary opacity-50"
              data-testid={`feed-card-locked-${feed.id}`}>
              <Lock className="w-4 h-4 shrink-0 text-text-muted" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-muted truncate">{feed.name}</p>
                <p className="text-[10px] text-text-muted">{feed.feedType}</p>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sev-medium/10 text-sev-medium font-medium">Upgrade</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section B: Private Feeds */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Your Own Feeds</h3>
          <span className="text-[10px] text-text-muted">{privateFeeds.length}/{maxPrivate} added</span>
        </div>
        {privateFeeds.map(pf => (
          <div key={pf.id} className="flex items-center gap-3 p-2 bg-bg-elevated rounded border border-border-subtle mb-2">
            <Rss className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary truncate">{pf.name}</p>
              <p className="text-[10px] text-text-muted truncate">{pf.url}</p>
            </div>
            <button onClick={() => removePrivateFeed(pf.id)} className="text-text-muted hover:text-sev-critical">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {showAddFeed ? (
          <div className="p-3 bg-bg-elevated rounded-lg border border-border-subtle space-y-2" data-testid="add-feed-form">
            <input value={newFeedName} onChange={e => setNewFeedName(e.target.value)}
              placeholder="Feed name" className="w-full px-3 py-1.5 text-xs bg-bg-primary border border-border-subtle rounded" />
            <input value={newFeedUrl} onChange={e => setNewFeedUrl(e.target.value)}
              placeholder="Feed URL" className="w-full px-3 py-1.5 text-xs bg-bg-primary border border-border-subtle rounded" />
            <div className="flex items-center gap-2">
              <select value={newFeedType} onChange={e => setNewFeedType(e.target.value as 'rss' | 'rest_api')}
                className="px-2 py-1 text-xs bg-bg-primary border border-border-subtle rounded">
                <option value="rss">RSS</option>
                <option value="rest_api">REST API</option>
              </select>
              <button onClick={handleTestFeed} disabled={!newFeedUrl || testing}
                className="px-3 py-1 text-[10px] font-medium bg-teal-400/15 text-teal-400 border border-teal-400/30 rounded hover:bg-teal-400/25 disabled:opacity-50"
                data-testid="test-feed-btn">
                {testing ? 'Testing…' : 'Test Feed'}
              </button>
              <button onClick={handleAddFeed} disabled={!newFeedName || !newFeedUrl}
                className="px-3 py-1 text-[10px] font-medium bg-accent text-white rounded disabled:opacity-50">Add</button>
              <button onClick={() => setShowAddFeed(false)} className="text-xs text-text-muted">Cancel</button>
            </div>
            {testResult && <p className="text-[10px] text-text-muted" data-testid="test-result">{testResult}</p>}
          </div>
        ) : (
          <button onClick={() => setShowAddFeed(true)}
            disabled={privateFeeds.length >= maxPrivate}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/5 disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" /> Add Your Own Feed
          </button>
        )}
      </div>

      {/* Section C: Alert Preferences */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Alert Preferences</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 bg-bg-elevated rounded-lg border border-border-subtle">
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Alert me on:</label>
            <select
              value={alertConfig.minSeverity}
              onChange={e => setAlertConfig({ ...alertConfig, minSeverity: e.target.value as AlertConfig['minSeverity'] })}
              className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-border-subtle rounded"
              data-testid="severity-select"
            >
              {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">
              Min confidence: <strong>{alertConfig.minConfidence}%</strong>
            </label>
            <input type="range" min={0} max={100} value={alertConfig.minConfidence}
              onChange={e => setAlertConfig({ ...alertConfig, minConfidence: Number(e.target.value) })}
              className="w-full" data-testid="confidence-slider" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">IOC types:</label>
            <div className="flex flex-wrap gap-1">
              {IOC_TYPE_OPTIONS.map(t => {
                const active = alertConfig.iocTypes.includes(t)
                return (
                  <button key={t}
                    onClick={() => {
                      const next = active
                        ? alertConfig.iocTypes.filter(x => x !== t)
                        : [...alertConfig.iocTypes, t]
                      setAlertConfig({ ...alertConfig, iocTypes: next })
                    }}
                    className={cn('px-1.5 py-0.5 text-[10px] rounded border',
                      active ? 'bg-accent/15 border-accent/30 text-accent' : 'border-border-subtle text-text-muted')}
                  >{t}</button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={onContinue}
          className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
          Continue
        </button>
        <button onClick={onSkip}
          className="px-4 py-2 text-xs font-medium border border-border-subtle text-text-muted rounded-lg hover:border-accent/50 transition-colors">
          Skip — Use Defaults
        </button>
      </div>
    </div>
  )
}
