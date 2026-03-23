/**
 * @module components/viz/IntegrationModals
 * @description Modals and detail panels for Integration page:
 * Add SIEM, Add Webhook, Add Ticketing, Add STIX, Add Export, Detail Panel.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useCreateSIEM, useCreateWebhook, useCreateTicketing,
  useCreateSTIXCollection, useCreateBulkExport, useTestSIEMConnection,
} from '@/hooks/use-phase5-data'
import { X, CheckCircle, AlertTriangle, Activity, Clock, Wifi } from 'lucide-react'

// ─── Shared Modal Shell ─────────────────────────────────────────

function ModalShell({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-bg-primary border border-border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated transition-colors">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-text-muted uppercase font-medium">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full px-3 py-2 text-xs bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent'

// ─── Add SIEM Modal ─────────────────────────────────────────────

export function AddSIEMModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('splunk')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const mutation = useCreateSIEM()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !endpoint.trim()) return
    mutation.mutate({ name: name.trim(), type, endpoint: endpoint.trim(), apiKey: apiKey.trim() }, {
      onSuccess: () => { setName(''); setType('splunk'); setEndpoint(''); setApiKey(''); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Add SIEM Integration">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Production Splunk" />
        </FormField>
        <FormField label="Type">
          <select className={inputClass} value={type} onChange={e => setType(e.target.value)}>
            <option value="splunk">Splunk</option>
            <option value="sentinel">Azure Sentinel</option>
            <option value="elastic">Elastic SIEM</option>
          </select>
        </FormField>
        <FormField label="Endpoint URL">
          <input className={inputClass} value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://..." />
        </FormField>
        <FormField label="API Key">
          <input className={inputClass} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API key or token" />
        </FormField>
        <button type="submit" disabled={mutation.isPending || !name.trim() || !endpoint.trim()}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Connecting…' : 'Add SIEM'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Add Webhook Modal ──────────────────────────────────────────

export function AddWebhookModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [hmac, setHmac] = useState(true)
  const [events, setEvents] = useState<string[]>([])
  const mutation = useCreateWebhook()

  const EVENT_OPTIONS = ['alert.critical', 'alert.high', 'alert.medium', 'alert.low', 'ioc.new', 'ioc.updated', 'hunt.finding']

  const toggleEvent = (ev: string) => setEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || events.length === 0) return
    mutation.mutate({ url: url.trim(), secret: secret.trim(), events, hmacEnabled: hmac }, {
      onSuccess: () => { setUrl(''); setSecret(''); setHmac(true); setEvents([]); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Add Webhook">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Webhook URL">
          <input className={inputClass} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        </FormField>
        <FormField label="Secret">
          <input className={inputClass} type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="HMAC signing secret" />
        </FormField>
        <FormField label="Event Types">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_OPTIONS.map(ev => (
              <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                className={cn('text-[10px] px-2 py-1 rounded-full border transition-colors',
                  events.includes(ev) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-bg-elevated text-text-muted border-border hover:border-accent/20')}>
                {ev}
              </button>
            ))}
          </div>
        </FormField>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={hmac} onChange={e => setHmac(e.target.checked)}
            className="rounded border-border" /> Enable HMAC signing
        </label>
        <button type="submit" disabled={mutation.isPending || !url.trim() || events.length === 0}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Creating…' : 'Add Webhook'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Add Ticketing Modal ────────────────────────────────────────

export function AddTicketingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('servicenow')
  const [instanceUrl, setInstanceUrl] = useState('')
  const [credentials, setCredentials] = useState('')
  const [defaultProject, setDefaultProject] = useState('')
  const mutation = useCreateTicketing()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !instanceUrl.trim()) return
    mutation.mutate({ name: name.trim(), type, instanceUrl: instanceUrl.trim(), credentials: credentials.trim(), defaultProject: defaultProject.trim() }, {
      onSuccess: () => { setName(''); setType('servicenow'); setInstanceUrl(''); setCredentials(''); setDefaultProject(''); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Connect Ticketing System">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., ServiceNow Production" />
        </FormField>
        <FormField label="Type">
          <select className={inputClass} value={type} onChange={e => setType(e.target.value)}>
            <option value="servicenow">ServiceNow</option>
            <option value="jira">Jira</option>
          </select>
        </FormField>
        <FormField label="Instance URL">
          <input className={inputClass} value={instanceUrl} onChange={e => setInstanceUrl(e.target.value)} placeholder="https://..." />
        </FormField>
        <FormField label="Credentials">
          <input className={inputClass} type="password" value={credentials} onChange={e => setCredentials(e.target.value)} placeholder="API token or OAuth" />
        </FormField>
        <FormField label="Default Project/Queue">
          <input className={inputClass} value={defaultProject} onChange={e => setDefaultProject(e.target.value)} placeholder="e.g., SEC-OPS" />
        </FormField>
        <button type="submit" disabled={mutation.isPending || !name.trim() || !instanceUrl.trim()}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Add STIX/TAXII Modal ───────────────────────────────────────

export function AddSTIXModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('subscribe')
  const [interval, setInterval] = useState('3600')
  const mutation = useCreateSTIXCollection()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), type, pollingInterval: parseInt(interval, 10) }, {
      onSuccess: () => { setName(''); setType('subscribe'); setInterval('3600'); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Add STIX/TAXII Collection">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Collection Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., ISAC Threat Share" />
        </FormField>
        <FormField label="Direction">
          <select className={inputClass} value={type} onChange={e => setType(e.target.value)}>
            <option value="subscribe">Subscribe (inbound)</option>
            <option value="publish">Publish (outbound)</option>
          </select>
        </FormField>
        <FormField label="Polling Interval">
          <select className={inputClass} value={interval} onChange={e => setInterval(e.target.value)}>
            <option value="3600">Every hour</option>
            <option value="21600">Every 6 hours</option>
            <option value="43200">Every 12 hours</option>
            <option value="86400">Daily</option>
          </select>
        </FormField>
        <button type="submit" disabled={mutation.isPending || !name.trim()}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Adding…' : 'Add Collection'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Add Bulk Export Modal ──────────────────────────────────────

export function AddExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState('stix')
  const [schedule, setSchedule] = useState('0 2 * * *')
  const [severity, setSeverity] = useState('')
  const mutation = useCreateBulkExport()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), format, schedule, severityFilter: severity || undefined }, {
      onSuccess: () => { setName(''); setFormat('stix'); setSchedule('0 2 * * *'); setSeverity(''); onClose() },
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="New Bulk Export">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Export Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Daily IOC Export" />
        </FormField>
        <FormField label="Format">
          <select className={inputClass} value={format} onChange={e => setFormat(e.target.value)}>
            <option value="stix">STIX 2.1</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </FormField>
        <FormField label="Schedule (cron)">
          <input className={inputClass} value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="0 2 * * *" />
        </FormField>
        <FormField label="Severity Filter (optional)">
          <select className={inputClass} value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            <option value="critical">Critical only</option>
            <option value="high">High and above</option>
            <option value="medium">Medium and above</option>
          </select>
        </FormField>
        <button type="submit" disabled={mutation.isPending || !name.trim()}
          className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 transition-colors disabled:opacity-50">
          {mutation.isPending ? 'Creating…' : 'Create Export'}
        </button>
      </form>
    </ModalShell>
  )
}

// ─── Integration Detail Panel ───────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hrs < 1) return '<1h ago'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function IntegrationDetailPanel({ tab, item, onClose, isDemo }: {
  tab: string; item: any; onClose: () => void; isDemo: boolean
}) {
  const testMutation = useTestSIEMConnection()

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-bg-primary border-l border-border z-50 overflow-y-auto shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary truncate">{item.name ?? item.url ?? 'Detail'}</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated transition-colors">
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          {item.status === 'active' ? <CheckCircle className="w-4 h-4 text-sev-low" /> :
           item.status === 'error' || item.status === 'failing' ? <AlertTriangle className="w-4 h-4 text-sev-critical" /> :
           <Clock className="w-4 h-4 text-text-muted" />}
          <span className={cn('text-xs font-medium capitalize',
            item.status === 'active' ? 'text-sev-low' : item.status === 'error' || item.status === 'failing' ? 'text-sev-critical' : 'text-text-muted')}>
            {item.status}
          </span>
        </div>

        {/* Config Summary */}
        <div className="space-y-2">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Configuration</h3>
          <div className="bg-bg-secondary rounded-lg border border-border p-3 space-y-2">
            {item.type && <DetailRow label="Type" value={item.type} />}
            {item.endpoint && <DetailRow label="Endpoint" value={item.endpoint} mono />}
            {item.url && <DetailRow label="URL" value={item.url} mono />}
            {item.project && <DetailRow label="Project" value={item.project} />}
            {item.format && <DetailRow label="Format" value={item.format.toUpperCase()} />}
            {item.schedule && <DetailRow label="Schedule" value={item.schedule} mono />}
            {item.pollingInterval && <DetailRow label="Interval" value={`${item.pollingInterval / 3600}h`} />}
            {item.hmacEnabled !== undefined && <DetailRow label="HMAC" value={item.hmacEnabled ? 'Enabled' : 'Disabled'} />}
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-2">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {item.eventsForwarded != null && (
              <MetricCard label="Events Forwarded" value={item.eventsForwarded.toLocaleString()} icon={Activity} />
            )}
            {item.latencyMs != null && (
              <MetricCard label="Latency" value={`${item.latencyMs}ms`} icon={Wifi}
                color={item.latencyMs > 200 ? 'text-sev-critical' : item.latencyMs > 100 ? 'text-sev-medium' : 'text-sev-low'} />
            )}
            {item.deliveryRate != null && (
              <MetricCard label="Delivery Rate" value={`${item.deliveryRate}%`} icon={CheckCircle}
                color={item.deliveryRate >= 99 ? 'text-sev-low' : 'text-sev-medium'} />
            )}
            {item.dlqCount != null && (
              <MetricCard label="DLQ Items" value={item.dlqCount.toString()} icon={AlertTriangle}
                color={item.dlqCount > 0 ? 'text-sev-high' : 'text-text-muted'} />
            )}
            {item.objectCount != null && (
              <MetricCard label="Objects" value={item.objectCount.toLocaleString()} icon={Activity} />
            )}
            {item.recordCount != null && (
              <MetricCard label="Records" value={item.recordCount.toLocaleString()} icon={Activity} />
            )}
          </div>
        </div>

        {/* Timestamps */}
        <div className="space-y-2">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Activity</h3>
          <div className="bg-bg-secondary rounded-lg border border-border p-3 space-y-2">
            {item.lastSync && <DetailRow label="Last Sync" value={timeAgo(item.lastSync)} />}
            {item.lastTriggered && <DetailRow label="Last Triggered" value={timeAgo(item.lastTriggered)} />}
            {item.lastPollOrPush && <DetailRow label="Last Poll/Push" value={timeAgo(item.lastPollOrPush)} />}
            {item.lastRun && <DetailRow label="Last Run" value={timeAgo(item.lastRun)} />}
            {item.nextRun && <DetailRow label="Next Run" value={timeAgo(item.nextRun)} />}
            <DetailRow label="Created" value={timeAgo(item.createdAt)} />
          </div>
        </div>

        {/* Actions */}
        {tab === 'siem' && (
          <button
            onClick={() => { if (!isDemo) testMutation.mutate(item.id) }}
            disabled={testMutation.isPending || isDemo}
            className="w-full py-2 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors disabled:opacity-50">
            {testMutation.isPending ? 'Testing…' : 'Test Connection'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Detail Helpers ─────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={cn('text-xs text-text-primary', mono && 'font-mono text-[11px] truncate max-w-[200px]')}>{value}</span>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.FC<{ className?: string }>; color?: string
}) {
  return (
    <div className="p-2 bg-bg-secondary rounded border border-border">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={cn('w-3 h-3', color ?? 'text-text-muted')} />
        <span className="text-[10px] text-text-muted">{label}</span>
      </div>
      <span className={cn('text-sm font-bold tabular-nums', color ?? 'text-text-primary')}>{value}</span>
    </div>
  )
}
