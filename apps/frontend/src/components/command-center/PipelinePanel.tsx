/**
 * @module components/command-center/PipelinePanel
 * @description Unified Pipeline sub-tab — merges Pipeline Monitor (queue stats, DLQ)
 * with Pipeline Health (stage status, latency, messages). System tab only.
 */
import { cn } from '@/lib/utils'
import {
  useQueueHealth, useQueueAlerts, useDlqStatus, useRetryDlqQueue, useRetryAllDlq,
  usePipelineHealth,
  type QueueDepth, type DlqQueueEntry,
} from '@/hooks/use-phase6-data'
import type { PipelineStage } from '@/hooks/phase6-demo-data'
import {
  RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Trash2,
} from 'lucide-react'

export function PipelinePanel() {
  const { data: queueData, refetch, isFetching } = useQueueHealth()
  const { data: alertsData } = useQueueAlerts()
  const { data: dlqData } = useDlqStatus()
  const { data: healthData } = usePipelineHealth()
  const retryQueue = useRetryDlqQueue()
  const retryAll = useRetryAllDlq()

  const queues: QueueDepth[] = queueData?.queues ?? []
  const alerts = alertsData?.alerts ?? []
  const dlqQueues: DlqQueueEntry[] = dlqData?.queues?.filter((q: DlqQueueEntry) => q.failed > 0) ?? []
  const stages: PipelineStage[] = healthData?.stages ?? []
  const overallHealth = healthData?.overall ?? 'unknown'

  // Queue-based status for stages without health data
  const queueStageStatus = (stage: string) => {
    const related = queues.filter(q => q.name.includes(stage.slice(0, 5)))
    const hasFailures = related.some(q => q.failed > 0)
    const hasWaiting = related.some(q => q.waiting > 10)
    if (hasFailures) return 'error'
    if (hasWaiting) return 'busy'
    return 'healthy'
  }

  // Merge health stage data with queue-based status
  const stageColor = (stage: PipelineStage) => {
    const qStatus = queueStageStatus(stage.name)
    if (stage.status === 'unhealthy' || qStatus === 'error') return 'bg-sev-critical'
    if (stage.status === 'unknown' || qStatus === 'busy') return 'bg-amber-400'
    return 'bg-sev-low'
  }

  const overallColor =
    overallHealth === 'healthy' ? 'text-sev-low' :
    overallHealth === 'degraded' ? 'text-amber-400' :
    overallHealth === 'unhealthy' ? 'text-sev-critical' : 'text-text-muted'

  return (
    <div className="space-y-4" data-testid="pipeline-subtab">
      {/* Overall pipeline health banner */}
      <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg border border-border" data-testid="pipeline-health-banner">
        <div className="flex items-center gap-2">
          {overallHealth === 'healthy' ? (
            <CheckCircle2 className={cn('w-4 h-4', overallColor)} />
          ) : (
            <AlertTriangle className={cn('w-4 h-4', overallColor)} />
          )}
          <span className={cn('text-sm font-semibold capitalize', overallColor)}>
            Pipeline {overallHealth}
          </span>
        </div>
        <span className="text-[10px] text-text-muted">
          Checked: {healthData?.lastCheckedAt ? new Date(healthData.lastCheckedAt).toLocaleTimeString() : '—'}
        </span>
      </div>

      {/* Pipeline stage flow with health data */}
      <div className="overflow-x-auto">
        <div className="flex items-center gap-2 min-w-[500px] p-3 bg-bg-elevated rounded-lg border border-border" data-testid="pipeline-flow">
          {stages.map((stage, i) => (
            <div key={stage.name} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-bg-base rounded-md border border-border min-w-[100px]">
                <div className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full', stageColor(stage))} />
                  <span className="text-xs font-medium text-text-primary capitalize">{stage.name}</span>
                </div>
                <span className="text-[10px] text-text-muted">
                  {stage.latencyMs != null ? `${stage.latencyMs}ms` : '—'}
                </span>
              </div>
              {i < stages.length - 1 && <ArrowRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stage detail cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="stage-health-cards">
        {stages.map(stage => (
          <div key={stage.name} className="flex items-start gap-2 p-2.5 bg-bg-elevated rounded-lg border border-border">
            <span className={cn('w-2 h-2 rounded-full mt-1 flex-shrink-0', stageColor(stage))} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary capitalize">{stage.name}</p>
              <p className="text-[10px] text-text-muted truncate">{stage.message}</p>
              <p className="text-[10px] text-text-muted">
                Latency: {stage.latencyMs != null ? `${stage.latencyMs}ms` : '—'}
                {' · '}Status: <span className="capitalize">{stage.status}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Active alerts banner */}
      {alerts.length > 0 && (
        <div className="p-2.5 bg-sev-critical/10 border border-sev-critical/30 rounded-lg" data-testid="queue-alerts">
          <p className="text-xs font-medium text-sev-critical flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {alerts.length} queue alert{alerts.length > 1 ? 's' : ''} active
          </p>
        </div>
      )}

      {/* Queue stats table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="queue-table">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 px-2 font-medium">Queue</th>
              <th className="text-right py-2 px-2 font-medium">Waiting</th>
              <th className="text-right py-2 px-2 font-medium">Active</th>
              <th className="text-right py-2 px-2 font-medium">Completed</th>
              <th className="text-right py-2 px-2 font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {queues.map(q => {
              const isStuck = q.waiting > 10
              return (
                <tr key={q.name} className={cn('border-b border-border/50', isStuck && 'bg-amber-400/5')}>
                  <td className="py-1.5 px-2 font-medium text-text-primary">
                    {q.name.replace('etip-', '')}
                    {isStuck && <span className="ml-1 text-[10px] text-amber-400">(stuck)</span>}
                  </td>
                  <td className={cn('text-right py-1.5 px-2', q.waiting > 0 ? 'text-amber-400' : 'text-text-muted')}>{q.waiting}</td>
                  <td className={cn('text-right py-1.5 px-2', q.active > 0 ? 'text-accent' : 'text-text-muted')}>{q.active}</td>
                  <td className="text-right py-1.5 px-2 text-text-muted">{q.completed}</td>
                  <td className={cn('text-right py-1.5 px-2', q.failed > 0 ? 'text-sev-critical' : 'text-text-muted')}>{q.failed}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Refresh + last updated */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Updated: {queueData?.updatedAt ? new Date(queueData.updatedAt).toLocaleTimeString() : '—'}</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-accent hover:text-accent-hover disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* DLQ failed items */}
      {dlqQueues.length > 0 && (
        <div className="space-y-2" data-testid="dlq-section">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-sev-critical" /> Failed Items (DLQ)
            </h3>
            <button
              onClick={() => retryAll.mutate()}
              disabled={retryAll.isPending}
              className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Retry All
            </button>
          </div>
          {dlqQueues.map(q => (
            <div key={q.name} className="flex items-center justify-between p-2 bg-bg-elevated rounded border border-border">
              <span className="text-xs text-text-primary">{q.name.replace('etip-', '')} — {q.failed} failed</span>
              <button
                onClick={() => retryQueue.mutate(q.name)}
                disabled={retryQueue.isPending}
                className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
