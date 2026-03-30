/**
 * @module components/command-center/ComplianceReportsPanel
 * @description Compliance report management for super admin + tenant admin DSAR.
 * Super admin: generate/view/download/delete SOC 2, Privileged Access, GDPR reports.
 * Tenant admin: generate/view DSAR exports for own org users.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useComplianceReports, useGenerateReport, useComplianceReport,
  useDeleteReport, useDsarExports, useGenerateDsar,
  type ComplianceReportType, type ReportStatus, type ReportFilters,
  type ComplianceReport, type ComplianceReportData,
} from '@/hooks/use-compliance-reports'
import { useUsers } from '@/hooks/use-phase5-data'
import { toast } from '@/components/ui/Toast'
import {
  Download, Eye, Trash2, Plus, X, Loader2,
  Shield, CheckCircle, XCircle,
  Globe,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const TYPE_LABELS: Record<ComplianceReportType, string> = {
  soc2_access_review: 'SOC 2 Access Review',
  privileged_access: 'Privileged Access',
  gdpr_dsar: 'GDPR DSAR',
}

const STATUS_STYLES: Record<ReportStatus, { label: string; className: string; icon: typeof CheckCircle }> = {
  generating: { label: 'Generating', className: 'bg-accent/15 text-accent', icon: Loader2 },
  completed: { label: 'Completed', className: 'bg-sev-low/15 text-sev-low', icon: CheckCircle },
  failed: { label: 'Failed', className: 'bg-sev-critical/15 text-sev-critical', icon: XCircle },
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const s = STATUS_STYLES[status]
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded font-medium', s.className)}>
      <Icon className={cn('w-3 h-3', status === 'generating' && 'animate-spin')} />
      {s.label}
    </span>
  )
}

// ─── Modal Shell ────────────────────────────────────────────

function ModalShell({ open, onClose, title, wide, children }: {
  open: boolean; onClose: () => void; title: string; wide?: boolean; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={cn('bg-bg-primary border border-border rounded-lg shadow-xl max-h-[85vh] overflow-y-auto', wide ? 'w-full max-w-3xl' : 'w-full max-w-md')}>
          <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-bg-primary z-10">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated"><X className="w-4 h-4 text-text-muted" /></button>
          </div>
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </>
  )
}

// ─── Report Viewer ──────────────────────────────────────────

function ReportViewer({ report, onClose }: { report: ComplianceReport; onClose: () => void }) {
  const { data: fullReport } = useComplianceReport(report.id)
  const rd = fullReport?.data

  return (
    <ModalShell open title={`${TYPE_LABELS[report.type]} — ${fmtDate(report.periodStart)} to ${fmtDate(report.periodEnd)}`} onClose={onClose} wide>
      {!rd ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : report.type === 'soc2_access_review' ? (
        <Soc2ReportView data={rd} />
      ) : report.type === 'privileged_access' ? (
        <PrivilegedAccessView data={rd} />
      ) : (
        <DsarReportView data={rd} />
      )}
    </ModalShell>
  )
}

function Soc2ReportView({ data: d }: { data: ComplianceReportData }) {
  return (
    <div className="space-y-4" data-testid="soc2-report-view">
      {/* Summary */}
      {d.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Total Users', value: d.summary.totalUsers },
            { label: 'Active', value: d.summary.active },
            { label: 'Inactive', value: d.summary.inactive },
            { label: 'Period', value: d.summary.period },
          ].map(c => (
            <div key={c.label} className="bg-bg-secondary border border-border rounded p-2">
              <p className="text-[10px] text-text-muted uppercase">{c.label}</p>
              <p className="text-sm font-bold text-text-primary">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Role Distribution */}
      {d.roleDistribution && (
        <Section title="Role Distribution">
          <div className="space-y-1">
            {Object.entries(d.roleDistribution).map(([role, count]) => (
              <div key={role} className="flex justify-between text-xs">
                <span className="text-text-secondary capitalize">{role.replace(/_/g, ' ')}</span>
                <span className="text-text-primary font-medium tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* MFA Adoption */}
      {d.mfaAdoption && (
        <Section title="MFA Adoption">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-bg-elevated rounded-full h-2.5 overflow-hidden">
              <div className="h-full bg-sev-low rounded-full" style={{ width: `${d.mfaAdoption.enabledPercent}%` }} />
            </div>
            <span className="text-xs font-bold text-text-primary">{d.mfaAdoption.enabledPercent}%</span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">{d.mfaAdoption.enabled} of {d.mfaAdoption.total} users</p>
        </Section>
      )}

      {/* Auth Methods */}
      {d.authMethods && (
        <Section title="Auth Methods">
          <div className="flex gap-4 text-xs">
            <span className="text-text-secondary">SSO: <strong className="text-text-primary">{d.authMethods.sso}</strong></span>
            <span className="text-text-secondary">Local: <strong className="text-text-primary">{d.authMethods.local}</strong></span>
          </div>
        </Section>
      )}

      {/* Access Changes */}
      {d.accessChanges && d.accessChanges.length > 0 && (
        <Section title="Access Changes">
          <SimpleTable
            headers={['User', 'Change', 'Date', 'Details']}
            rows={d.accessChanges.map(c => [c.user, c.changeType, fmtDate(c.date), c.details])}
          />
        </Section>
      )}

      {/* Stale Accounts */}
      {d.staleAccounts && d.staleAccounts.length > 0 && (
        <Section title="Stale Accounts">
          <SimpleTable
            headers={['User', 'Last Activity', 'Days Since Active']}
            rows={d.staleAccounts.map(s => [s.user, fmtDate(s.lastActivity), String(s.daysSinceActive)])}
          />
        </Section>
      )}

      {/* Review Actions */}
      {d.reviewActions && d.reviewActions.length > 0 && (
        <Section title="Review Actions">
          <SimpleTable
            headers={['Review', 'Action', 'Reviewed By', 'Date']}
            rows={d.reviewActions.map(r => [r.review, r.action, r.reviewedBy, fmtDate(r.date)])}
          />
        </Section>
      )}
    </div>
  )
}

function PrivilegedAccessView({ data: d }: { data: ComplianceReportData }) {
  return (
    <div className="space-y-4" data-testid="privileged-access-view">
      {d.superAdmins && d.superAdmins.length > 0 && (
        <Section title="Super Admins">
          <SimpleTable
            headers={['Email', 'Last Login', 'Sessions', 'MFA', 'Locations']}
            rows={d.superAdmins.map(a => [a.email, fmtDate(a.lastLogin), String(a.sessions), a.mfa ? 'Yes' : 'No', a.geoLocations.join(', ')])}
          />
        </Section>
      )}
      {d.tenantAdmins && d.tenantAdmins.length > 0 && (
        <Section title="Tenant Admins">
          <SimpleTable
            headers={['Email', 'Org', 'Last Login', 'MFA']}
            rows={d.tenantAdmins.map(a => [a.email, a.org, fmtDate(a.lastLogin), a.mfa ? 'Yes' : 'No'])}
          />
        </Section>
      )}
      {d.apiKeysSummary && (
        <Section title={`API Keys (${d.apiKeysSummary.total} active)`}>
          <div className="space-y-1 text-xs">
            {Object.entries(d.apiKeysSummary.byTenant).map(([t, c]) => (
              <div key={t} className="flex justify-between"><span className="text-text-secondary">{t}</span><span className="text-text-primary font-medium">{c}</span></div>
            ))}
          </div>
        </Section>
      )}
      {d.scimTokensSummary && (
        <Section title={`SCIM Tokens (${d.scimTokensSummary.total} active)`}>
          <div className="space-y-1 text-xs">
            {Object.entries(d.scimTokensSummary.byTenant).map(([t, c]) => (
              <div key={t} className="flex justify-between"><span className="text-text-secondary">{t}</span><span className="text-text-primary font-medium">{c}</span></div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function DsarReportView({ data: d }: { data: ComplianceReportData }) {
  return (
    <div className="space-y-4" data-testid="dsar-report-view">
      {d.dataSubject && (
        <Section title="Data Subject">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-text-muted">Name:</span> <span className="text-text-primary">{d.dataSubject.name}</span></div>
            <div><span className="text-text-muted">Email:</span> <span className="text-text-primary">{d.dataSubject.email}</span></div>
            <div><span className="text-text-muted">Role:</span> <span className="text-text-primary">{d.dataSubject.role}</span></div>
            <div><span className="text-text-muted">Created:</span> <span className="text-text-primary">{fmtDate(d.dataSubject.createdAt)}</span></div>
          </div>
        </Section>
      )}
      {d.profileDetails && (
        <Section title="Profile Details">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-text-muted">Designation:</span> <span className="text-text-primary">{d.profileDetails.designation}</span></div>
            <div><span className="text-text-muted">MFA:</span> <span className="text-text-primary">{d.profileDetails.mfaStatus ? 'Enabled' : 'Disabled'}</span></div>
            <div><span className="text-text-muted">SSO:</span> <span className="text-text-primary">{d.profileDetails.ssoLinked ? 'Linked' : 'Not linked'}</span></div>
          </div>
        </Section>
      )}
      {d.sessionsHistory && d.sessionsHistory.length > 0 && (
        <Section title="Sessions History">
          <SimpleTable
            headers={['IP', 'Location', 'Started', 'Ended']}
            rows={d.sessionsHistory.map(s => [s.ip, s.geo, fmtDate(s.startedAt), fmtDate(s.endedAt)])}
          />
        </Section>
      )}
      {d.auditEntries && d.auditEntries.length > 0 && (
        <Section title="Audit Log">
          <SimpleTable
            headers={['Action', 'Timestamp']}
            rows={d.auditEntries.map(e => [e.action, fmtDate(e.timestamp)])}
          />
        </Section>
      )}
      {d.contentSummary && (
        <Section title="Created Content">
          <div className="flex gap-4 text-xs">
            <span className="text-text-secondary">IOCs: <strong className="text-text-primary">{d.contentSummary.iocs}</strong></span>
            <span className="text-text-secondary">Reports: <strong className="text-text-primary">{d.contentSummary.reports}</strong></span>
            <span className="text-text-secondary">Investigations: <strong className="text-text-primary">{d.contentSummary.investigations}</strong></span>
          </div>
        </Section>
      )}
      {d.exportTimestamp && (
        <p className="text-[10px] text-text-muted">Exported: {fmtDate(d.exportTimestamp)}</p>
      )}
    </div>
  )
}

// ─── Shared UI Helpers ──────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3">
      <p className="text-[10px] text-text-muted uppercase font-medium mb-2">{title}</p>
      {children}
    </div>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] text-text-muted uppercase border-b border-border/50">
          {headers.map(h => <th key={h} className="py-1 pr-3">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/30">
              {row.map((cell, j) => <td key={j} className="py-1.5 pr-3 text-text-secondary">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Generate Report Modal ──────────────────────────────────

function GenerateReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<ComplianceReportType>('soc2_access_review')
  const [periodStart, setPeriodStart] = useState(getDefaultStart())
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10))
  const [userId, setUserId] = useState('')
  const genMut = useGenerateReport()

  const inputClass = 'w-full px-3 py-2 text-xs bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent'

  const handleGenerate = () => {
    genMut.mutate({ type, periodStart, periodEnd, userId: type === 'gdpr_dsar' ? userId : undefined }, {
      onSuccess: () => { toast('Report generation started', 'success'); onClose() },
      onError: () => toast('Failed to generate report', 'error'),
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Generate Compliance Report">
      <div className="space-y-1">
        <label className="text-[10px] text-text-muted uppercase font-medium">Report Type</label>
        <select value={type} onChange={e => setType(e.target.value as ComplianceReportType)} className={inputClass} data-testid="report-type-select">
          <option value="soc2_access_review">SOC 2 Access Review</option>
          <option value="privileged_access">Privileged Access</option>
          <option value="gdpr_dsar">GDPR DSAR</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">From</label>
          <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">To</label>
          <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inputClass} />
        </div>
      </div>
      {type === 'gdpr_dsar' && (
        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">User Email / ID</label>
          <input type="text" value={userId} onChange={e => setUserId(e.target.value)} placeholder="user@example.com" className={inputClass} data-testid="dsar-user-input" />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-bg-secondary border border-border text-text-secondary hover:bg-bg-hover">Cancel</button>
        <button onClick={handleGenerate} disabled={genMut.isPending} className="px-3 py-1.5 text-xs rounded bg-accent text-bg-primary font-medium hover:bg-accent/90 disabled:opacity-50" data-testid="generate-report-submit">
          {genMut.isPending ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </ModalShell>
  )
}

function getDefaultStart(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}

// ─── Super Admin: Reports List ──────────────────────────────

export function ComplianceReportsList() {
  const [filters, setFilters] = useState<ReportFilters>({ page: 1, limit: 50 })
  const { data, isLoading } = useComplianceReports(filters)
  const deleteMut = useDeleteReport()
  const [showGenerate, setShowGenerate] = useState(false)
  const [viewReport, setViewReport] = useState<ComplianceReport | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const inputClass = 'px-2 py-1.5 text-xs bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent'

  const handleDelete = (id: string) => {
    deleteMut.mutate(id, {
      onSuccess: () => { toast('Report deleted', 'success'); setDeleteConfirm(null) },
      onError: () => toast('Failed to delete report', 'error'),
    })
  }

  return (
    <div className="space-y-3" data-testid="compliance-reports-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Compliance Reports</h3>
        </div>
        <button onClick={() => setShowGenerate(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-accent text-bg-primary font-medium hover:bg-accent/90" data-testid="generate-report-btn">
          <Plus className="w-3 h-3" /> Generate Report
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filters.type ?? 'all'} onChange={e => setFilters(f => ({ ...f, type: e.target.value as ComplianceReportType | 'all', page: 1 }))} className={inputClass} data-testid="filter-report-type">
          <option value="all">All Types</option>
          <option value="soc2_access_review">SOC 2 Access Review</option>
          <option value="privileged_access">Privileged Access</option>
          <option value="gdpr_dsar">GDPR DSAR</option>
        </select>
        <select value={filters.status ?? 'all'} onChange={e => setFilters(f => ({ ...f, status: e.target.value as ReportStatus | 'all', page: 1 }))} className={inputClass} data-testid="filter-report-status">
          <option value="all">All Statuses</option>
          <option value="generating">Generating</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-bg-secondary rounded animate-pulse" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="reports-table">
            <thead>
              <tr className="border-b border-border text-left text-[10px] text-text-muted uppercase">
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">Period</th>
                <th className="py-2 px-2 hidden sm:table-cell">Scope</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2 hidden md:table-cell">Generated By</th>
                <th className="py-2 px-2 hidden md:table-cell">Date</th>
                <th className="py-2 px-2 hidden lg:table-cell">Size</th>
                <th className="py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(report => (
                <tr key={report.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors" data-testid={`report-row-${report.id}`}>
                  <td className="py-2 px-2 text-text-primary font-medium">{TYPE_LABELS[report.type]}</td>
                  <td className="py-2 px-2 text-text-secondary">{fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}</td>
                  <td className="py-2 px-2 text-text-secondary hidden sm:table-cell">{report.scope}</td>
                  <td className="py-2 px-2"><StatusBadge status={report.status} /></td>
                  <td className="py-2 px-2 text-text-muted hidden md:table-cell">{report.generatedBy}</td>
                  <td className="py-2 px-2 text-text-muted hidden md:table-cell">{fmtDate(report.createdAt)}</td>
                  <td className="py-2 px-2 text-text-muted hidden lg:table-cell tabular-nums">{fmtSize(report.sizeBytes)}</td>
                  <td className="py-2 px-2">
                    <div className="flex gap-1">
                      {report.status === 'completed' && (
                        <>
                          <button onClick={() => setViewReport(report)} className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-accent" title="View" data-testid={`view-btn-${report.id}`}><Eye className="w-3.5 h-3.5" /></button>
                          <a href={`/api/v1/admin/compliance/reports/${report.id}`} download className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-accent" title="Download"><Download className="w-3.5 h-3.5" /></a>
                        </>
                      )}
                      <button onClick={() => setDeleteConfirm(report.id)} className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-sev-critical" title="Delete" data-testid={`delete-btn-${report.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-text-muted">No reports generated yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate modal */}
      <GenerateReportModal open={showGenerate} onClose={() => setShowGenerate(false)} />

      {/* Report viewer */}
      {viewReport && <ReportViewer report={viewReport} onClose={() => setViewReport(null)} />}

      {/* Delete confirmation */}
      <ModalShell open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Report">
        <p className="text-xs text-text-secondary">Are you sure you want to delete this report? This action cannot be undone.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-xs rounded bg-bg-secondary border border-border text-text-secondary hover:bg-bg-hover">Cancel</button>
          <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} disabled={deleteMut.isPending} className="px-3 py-1.5 text-xs rounded bg-sev-critical text-white font-medium hover:bg-sev-critical/90 disabled:opacity-50" data-testid="delete-confirm-btn">
            {deleteMut.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </ModalShell>
    </div>
  )
}

// ─── Tenant Admin: DSAR Panel ───────────────────────────────

export function DsarPanel() {
  const { data, isLoading } = useDsarExports()
  const { data: usersData } = useUsers()
  const genMut = useGenerateDsar()
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  const users = usersData?.data ?? []
  const inputClass = 'w-full px-3 py-2 text-xs bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent'

  const handleGenerate = () => {
    if (!selectedUserId) return
    genMut.mutate({ userId: selectedUserId }, {
      onSuccess: () => { toast('DSAR export started', 'success'); setShowGenerate(false); setSelectedUserId('') },
      onError: () => toast('Failed to start DSAR export', 'error'),
    })
  }

  return (
    <div className="space-y-3" data-testid="dsar-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">DSAR Exports</h3>
        </div>
        <button onClick={() => setShowGenerate(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-accent text-bg-primary font-medium hover:bg-accent/90" data-testid="generate-dsar-btn">
          <Plus className="w-3 h-3" /> Export User Data (DSAR)
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-bg-secondary rounded animate-pulse" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="dsar-table">
            <thead>
              <tr className="border-b border-border text-left text-[10px] text-text-muted uppercase">
                <th className="py-2 px-2">User</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Requested</th>
                <th className="py-2 px-2">Size</th>
                <th className="py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(exp => (
                <tr key={exp.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                  <td className="py-2 px-2 text-text-primary font-medium">{exp.userName}</td>
                  <td className="py-2 px-2"><StatusBadge status={exp.status} /></td>
                  <td className="py-2 px-2 text-text-muted">{fmtDate(exp.requestedAt)}</td>
                  <td className="py-2 px-2 text-text-muted tabular-nums">{fmtSize(exp.sizeBytes)}</td>
                  <td className="py-2 px-2">
                    {exp.status === 'completed' && (
                      <a href={`/api/v1/settings/compliance/dsar/${exp.id}`} download className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-accent" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-text-muted">No DSAR exports yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate DSAR modal */}
      <ModalShell open={showGenerate} onClose={() => { setShowGenerate(false); setSelectedUserId('') }} title="Export User Data (DSAR)">
        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">Select User</label>
          <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className={inputClass} data-testid="dsar-user-select">
            <option value="">— Select a user —</option>
            {users.map((u: { id: string; displayName?: string; email?: string }) => (
              <option key={u.id} value={u.id}>{u.displayName ?? u.email ?? u.id}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => { setShowGenerate(false); setSelectedUserId('') }} className="px-3 py-1.5 text-xs rounded bg-bg-secondary border border-border text-text-secondary hover:bg-bg-hover">Cancel</button>
          <button onClick={handleGenerate} disabled={genMut.isPending || !selectedUserId} className="px-3 py-1.5 text-xs rounded bg-accent text-bg-primary font-medium hover:bg-accent/90 disabled:opacity-50" data-testid="dsar-generate-submit">
            {genMut.isPending ? 'Generating…' : 'Generate Export'}
          </button>
        </div>
      </ModalShell>
    </div>
  )
}
