/**
 * @module components/viz/HuntingModals
 * @description Interactive modals for Hunting Workbench:
 * - CreateHuntModal: start a new hunt session
 * - AddHypothesisForm: inline form to add hypothesis
 * - AddEvidenceForm: inline form to add evidence
 * - HuntStatusControls: pause/resume/complete/archive
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useCreateHunt, useChangeHuntStatus, useAddHypothesis, useAddEvidence,
  type HuntTemplate,
} from '@/hooks/use-phase4-data'
import {
  X, Plus, Play, Pause, CheckCircle, Archive,
  Brain, FileText, Target, Layers, Eye,
} from 'lucide-react'

// ─── Hunt Type Options ──────────────────────────────────────────

const HUNT_TYPES = [
  { value: 'hypothesis', label: 'Hypothesis-driven', icon: Brain },
  { value: 'indicator', label: 'Indicator-based', icon: Target },
  { value: 'behavioral', label: 'Behavioral', icon: Layers },
  { value: 'anomaly', label: 'Anomaly detection', icon: Eye },
]

const EVIDENCE_TYPES = [
  { value: 'ioc_match', label: 'IOC Match' },
  { value: 'log_entry', label: 'Log Entry' },
  { value: 'network_capture', label: 'Network Capture' },
  { value: 'artifact', label: 'Artifact' },
  { value: 'screenshot', label: 'Screenshot' },
]

// ─── Create Hunt Modal ──────────────────────────────────────────

export function CreateHuntModal({ open, onClose, templates }: {
  open: boolean; onClose: () => void; templates: HuntTemplate[]
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [huntType, setHuntType] = useState('hypothesis')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const createMutation = useCreateHunt()

  if (!open) return null

  const handleTemplateSelect = (tpl: HuntTemplate) => {
    setTemplateId(tpl.id)
    setName(tpl.name)
    setDescription(tpl.description)
    setHuntType(tpl.huntType)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createMutation.mutate(
      { name: name.trim(), description: description.trim(), huntType, templateId: templateId ?? undefined },
      { onSuccess: () => { setName(''); setDescription(''); setTemplateId(null); onClose() } },
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-bg-primary border border-border rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-text-primary">New Hunt Session</h2>
            </div>
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Quick-start from template */}
            {templates.length > 0 && !templateId && (
              <div>
                <label className="text-xs text-text-muted mb-1.5 block">Quick-start from playbook</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {templates.slice(0, 4).map(tpl => (
                    <button key={tpl.id} type="button" onClick={() => handleTemplateSelect(tpl)}
                      className="text-left p-2 rounded-md border border-border bg-bg-secondary hover:border-accent/30 transition-colors">
                      <div className="text-[11px] font-medium text-text-primary truncate">{tpl.name}</div>
                      <div className="text-[10px] text-text-muted">{tpl.huntType} &middot; {tpl.usageCount} uses</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {templateId && (
              <div className="flex items-center gap-2 text-[10px] text-accent">
                <span>Using template: {name}</span>
                <button type="button" onClick={() => { setTemplateId(null); setName(''); setDescription('') }}
                  className="text-text-muted hover:text-text-primary"><X className="w-3 h-3" /></button>
              </div>
            )}

            {/* Hunt Type */}
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">Hunt Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                {HUNT_TYPES.map(t => {
                  const Icon = t.icon
                  return (
                    <button key={t.value} type="button" onClick={() => setHuntType(t.value)}
                      className={cn('flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] font-medium border transition-all',
                        huntType === t.value ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-border bg-bg-secondary text-text-muted')}>
                      <Icon className="w-3.5 h-3.5" />{t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Hunt Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                placeholder="e.g., APT28 Lateral Movement Investigation"
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                placeholder="What are you investigating? What triggered this hunt?"
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-text-muted border border-border rounded-md">Cancel</button>
              <button type="submit" disabled={!name.trim() || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-md hover:bg-emerald-500/90 disabled:opacity-50">
                {createMutation.isPending ? 'Creating...' : 'Start Hunt'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Hunt Status Controls ───────────────────────────────────────

const STATUS_ACTIONS: Record<string, { label: string; next: string; icon: React.FC<{ className?: string }>; color: string }[]> = {
  active: [
    { label: 'Pause', next: 'paused', icon: Pause, color: 'text-sev-medium' },
    { label: 'Complete', next: 'completed', icon: CheckCircle, color: 'text-sev-low' },
  ],
  paused: [
    { label: 'Resume', next: 'active', icon: Play, color: 'text-sev-low' },
    { label: 'Complete', next: 'completed', icon: CheckCircle, color: 'text-sev-low' },
  ],
  completed: [
    { label: 'Archive', next: 'archived', icon: Archive, color: 'text-text-muted' },
    { label: 'Reopen', next: 'active', icon: Play, color: 'text-sev-low' },
  ],
  archived: [
    { label: 'Reopen', next: 'active', icon: Play, color: 'text-sev-low' },
  ],
}

export function HuntStatusControls({ huntId, status, isDemo }: {
  huntId: string; status: string; isDemo: boolean
}) {
  const statusMutation = useChangeHuntStatus()
  const actions = STATUS_ACTIONS[status] ?? []

  return (
    <div className="flex items-center gap-1.5">
      {actions.map(({ label, next, icon: Icon, color }) => (
        <button key={next}
          onClick={() => statusMutation.mutate({ huntId, status: next })}
          disabled={statusMutation.isPending || isDemo}
          className={cn('flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border hover:border-current/30 transition-colors disabled:opacity-50', color)}>
          <Icon className="w-3 h-3" />{label}
        </button>
      ))}
    </div>
  )
}

// ─── Add Hypothesis Form ────────────────────────────────────────

export function AddHypothesisForm({ huntId, onDone, isDemo }: {
  huntId: string; onDone: () => void; isDemo: boolean
}) {
  const [statement, setStatement] = useState('')
  const [rationale, setRationale] = useState('')
  const [techniques, setTechniques] = useState('')
  const addMutation = useAddHypothesis()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!statement.trim() || !rationale.trim()) return
    const mitreTechniques = techniques.split(',').map(t => t.trim()).filter(Boolean)
    addMutation.mutate(
      { huntId, statement: statement.trim(), rationale: rationale.trim(), mitreTechniques },
      { onSuccess: () => { setStatement(''); setRationale(''); setTechniques(''); onDone() } },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-bg-secondary rounded-lg border border-border space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-medium text-text-primary">New Hypothesis</span>
      </div>
      <input type="text" value={statement} onChange={e => setStatement(e.target.value)}
        placeholder="Hypothesis statement..." disabled={isDemo}
        className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50" />
      <textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={2}
        placeholder="Rationale — why do you think this is true?" disabled={isDemo}
        className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none disabled:opacity-50" />
      <input type="text" value={techniques} onChange={e => setTechniques(e.target.value)}
        placeholder="MITRE techniques (comma-separated): T1059.001, T1021" disabled={isDemo}
        className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-[10px] px-2 py-1 text-text-muted">Cancel</button>
        <button type="submit" disabled={!statement.trim() || !rationale.trim() || addMutation.isPending || isDemo}
          className="text-[10px] px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded hover:bg-purple-500/20 disabled:opacity-50">
          Add Hypothesis
        </button>
      </div>
    </form>
  )
}

// ─── Add Evidence Form ──────────────────────────────────────────

export function AddEvidenceForm({ huntId, onDone, isDemo }: {
  huntId: string; onDone: () => void; isDemo: boolean
}) {
  const [type, setType] = useState('ioc_match')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [entityValue, setEntityValue] = useState('')
  const addMutation = useAddEvidence()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    addMutation.mutate(
      { huntId, type, title: title.trim(), description: description.trim(), entityValue: entityValue.trim() || undefined },
      { onSuccess: () => { setTitle(''); setDescription(''); setEntityValue(''); onDone() } },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-bg-secondary rounded-lg border border-border space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium text-text-primary">Add Evidence</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {EVIDENCE_TYPES.map(et => (
          <button key={et.value} type="button" onClick={() => setType(et.value)}
            className={cn('text-[10px] px-2 py-1 rounded border transition-colors',
              type === et.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-muted')}>
            {et.label}
          </button>
        ))}
      </div>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Evidence title..." disabled={isDemo}
        className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
        placeholder="Description of the evidence..." disabled={isDemo}
        className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none disabled:opacity-50" />
      <input type="text" value={entityValue} onChange={e => setEntityValue(e.target.value)}
        placeholder="IOC value (optional): 185.220.101.34" disabled={isDemo}
        className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-[10px] px-2 py-1 text-text-muted">Cancel</button>
        <button type="submit" disabled={!title.trim() || !description.trim() || addMutation.isPending || isDemo}
          className="text-[10px] px-3 py-1 bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 disabled:opacity-50">
          Add Evidence
        </button>
      </div>
    </form>
  )
}
