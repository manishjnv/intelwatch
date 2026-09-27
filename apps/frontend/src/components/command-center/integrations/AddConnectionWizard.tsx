/**
 * @module components/command-center/integrations/AddConnectionWizard
 * @description 3-step connector wizard: pick type -> fields+triggers -> test (mandatory) ->
 * save. The real backend has no dry-run test endpoint — POST /integrations/:id/test needs an
 * existing id (integrations.ts:98) — so "Test connection" creates (or, in Edit mode / on a
 * retry, updates) the row first, then tests it. "Save" only closes the wizard; persistence
 * already happened at the successful test. If the user cancels a NEW connector before a
 * successful test, the draft row is best-effort deleted so the list never shows a phantom
 * connector; an existing connector being edited is never deleted on cancel.
 */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import {
  useCreateIntegration, useUpdateIntegration, useTestIntegration, useDeleteIntegration,
  fieldError, type Integration, type IntegrationType, type TriggerEvent, type IntegrationInput,
} from '@/hooks/use-integrations'
import {
  CONNECTOR_TYPES, TRIGGERS, DEFAULT_TRIGGERS, URL_FIELD_KEY,
  buildConfigPayload, valuesFromIntegration, type FieldDef,
} from './connector-types'
import { X, Loader2, CheckCircle, AlertTriangle, ChevronLeft } from 'lucide-react'

const SIEM_WEBHOOK_TYPES: IntegrationType[] = ['splunk_hec', 'sentinel', 'elastic_siem', 'webhook']
const TICKETING_TYPES: IntegrationType[] = ['servicenow', 'jira']

interface AddConnectionWizardProps {
  onClose: () => void
  editTarget?: Integration
}

export function AddConnectionWizard({ onClose, editTarget }: AddConnectionWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(editTarget ? 2 : 1)
  const [type, setType] = useState<IntegrationType | null>(editTarget?.type ?? null)
  const [name, setName] = useState(editTarget?.name ?? '')
  const [values, setValues] = useState<Record<string, string>>(editTarget ? valuesFromIntegration(editTarget) : {})
  const [triggers, setTriggers] = useState<TriggerEvent[]>(editTarget?.triggers ?? DEFAULT_TRIGGERS)
  const [savedId, setSavedId] = useState<string | null>(editTarget?.id ?? null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const createMutation = useCreateIntegration()
  const updateMutation = useUpdateIntegration()
  const testMutation = useTestIntegration()
  const deleteMutation = useDeleteIntegration()
  const panelRef = useRef<HTMLDivElement>(null)

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isTesting = testMutation.isPending

  const handleCancel = () => {
    if (!editTarget && savedId && !testResult?.success) {
      deleteMutation.mutate(savedId) // ponytail: best-effort cleanup, fire-and-forget
    }
    onClose()
  }
  // The keydown listener is registered once; the ref keeps it calling the latest handleCancel
  // (otherwise Escape would see savedId=null and leave an untested draft behind).
  const cancelRef = useRef(handleCancel)
  cancelRef.current = handleCancel

  // Focus trap + Escape-to-cancel — no shared modal primitive with a trap exists in this codebase yet.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('button, input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cancelRef.current(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, input, a[href]'))
        .filter(el => !el.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0]!, last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const toggleTrigger = (t: TriggerEvent) =>
    setTriggers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const meta = type ? CONNECTOR_TYPES[type] : null
  const requiredFields = meta?.fields.filter(f => !f.optional) ?? []
  const canProceed = !!type && name.trim() !== '' && triggers.length > 0
    && requiredFields.every(f => (values[f.key] ?? '').trim() !== '')

  const handleTest = async () => {
    if (!type) return
    setTestResult(null)
    setFieldErrors({})
    const payload: IntegrationInput = { name: name.trim(), type, enabled: true, triggers, ...buildConfigPayload(type, values) }
    try {
      let id = savedId
      if (!id) {
        const created = await createMutation.mutateAsync(payload)
        id = created.id
        setSavedId(id)
      } else {
        await updateMutation.mutateAsync({ id, input: payload })
      }
      const result = await testMutation.mutateAsync(id)
      setTestResult(result)
    } catch (err) {
      const urlKey = URL_FIELD_KEY[type]
      const msg = urlKey ? fieldError(err, `.${urlKey}`) : null
      if (msg) { setFieldErrors({ [urlKey]: msg }); setStep(2) } // jump back so the error sits inline on the field
      else setTestResult({ success: false, message: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' })
    }
  }

  const handleSave = () => {
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center" data-testid="add-connection-wizard">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={editTarget ? 'Edit connection' : 'Add connection'}
        className="bg-bg-primary border border-border rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-md h-[92vh] md:h-auto md:max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-bg-primary">
          <div className="flex items-center gap-2">
            {step > 1 && !editTarget && (
              <button onClick={() => setStep(step === 3 ? 2 : 1)} className="p-1 rounded hover:bg-bg-elevated" aria-label="Back" data-testid="wizard-back-btn">
                <ChevronLeft className="w-4 h-4 text-text-muted" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-text-primary">
              {editTarget ? `Edit ${meta?.label ?? 'connection'}` : step === 1 ? 'Add connection' : step === 2 ? `Configure ${meta?.label}` : 'Test & save'}
            </h2>
          </div>
          <button onClick={handleCancel} className="p-1 rounded hover:bg-bg-elevated" aria-label="Close" data-testid="wizard-close-btn">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {step === 1 && (
            <TypeStep onSelect={t => { setType(t); setValues({}); setStep(2) }} />
          )}

          {step === 2 && meta && (
            <div className="space-y-3">
              <Field
                def={{ key: 'name', label: 'Connection name', help: 'A name to recognize this connection by' }}
                value={name}
                onChange={setName}
              />
              {meta.fields.map(f => (
                <Field
                  key={f.key} def={f} value={values[f.key] ?? ''}
                  onChange={v => { setValues(prev => ({ ...prev, [f.key]: v })); if (fieldErrors[f.key]) setFieldErrors({}) }}
                  error={fieldErrors[f.key]}
                />
              ))}

              <div className="space-y-1">
                <span className="text-[10px] text-text-muted uppercase font-medium block">Send on</span>
                <div className="flex flex-wrap gap-1.5">
                  {TRIGGERS.map(t => (
                    <button
                      key={t.value} type="button" onClick={() => toggleTrigger(t.value)}
                      className={cn('text-[10px] px-2 py-1 rounded-full border transition-colors',
                        triggers.includes(t.value) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-bg-elevated text-text-muted border-border hover:border-accent/20')}
                      data-testid={`trigger-${t.value}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {triggers.length === 0 && <p className="text-[10px] text-sev-critical">Pick at least one event.</p>}
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={!canProceed}
                className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
                data-testid="wizard-continue-btn"
              >
                Continue
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="bg-bg-secondary rounded-lg border border-border p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-text-muted">Type</span><span className="text-text-primary">{meta?.label}</span></div>
                <div className="flex justify-between text-xs"><span className="text-text-muted">Name</span><span className="text-text-primary truncate max-w-[220px]" title={name}>{name}</span></div>
              </div>

              {testResult && (
                <div
                  className={cn('flex items-start gap-2 px-3 py-2 rounded-lg border',
                    testResult.success ? 'bg-sev-low/10 border-sev-low/20' : 'bg-sev-critical/10 border-sev-critical/20')}
                  data-testid="wizard-test-result"
                >
                  {testResult.success ? <CheckCircle className="w-3.5 h-3.5 text-sev-low shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-sev-critical shrink-0 mt-0.5" />}
                  <p className={cn('text-xs', testResult.success ? 'text-sev-low' : 'text-sev-critical')}>{testResult.message}</p>
                </div>
              )}

              <button
                onClick={handleTest}
                disabled={isSaving || isTesting}
                className="w-full py-2 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                data-testid="wizard-test-btn"
              >
                {(isSaving || isTesting) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSaving ? 'Saving…' : isTesting ? 'Testing…' : 'Test connection'}
              </button>

              <button
                onClick={handleSave}
                disabled={!testResult?.success}
                className="w-full py-2 text-xs font-medium bg-accent text-bg-primary rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
                data-testid="wizard-save-btn"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TypeStep({ onSelect }: { onSelect: (t: IntegrationType) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SIEM_WEBHOOK_TYPES.map(t => <TypeCard key={t} type={t} onSelect={onSelect} />)}
      </div>
      <div>
        <span className="text-[10px] text-text-muted uppercase font-medium block mb-1">Ticketing</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TICKETING_TYPES.map(t => <TypeCard key={t} type={t} onSelect={onSelect} />)}
        </div>
      </div>
    </div>
  )
}

function TypeCard({ type, onSelect }: { type: IntegrationType; onSelect: (t: IntegrationType) => void }) {
  const meta = CONNECTOR_TYPES[type]
  return (
    <button
      onClick={() => onSelect(type)}
      className="text-left p-3 border border-border rounded-lg hover:border-accent/40 hover:bg-bg-hover transition-colors"
      data-testid={`pick-type-${type}`}
    >
      <span className="block text-xs font-medium text-text-primary">{meta.label}</span>
      <span className="block text-[10px] text-text-muted mt-0.5">{meta.purpose}</span>
    </button>
  )
}

function Field({ def, value, onChange, error }: {
  def: Pick<FieldDef, 'key' | 'label' | 'help' | 'secret' | 'placeholder'>
  value: string; onChange: (v: string) => void; error?: string
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={`field-${def.key}`} className="text-[10px] text-text-muted uppercase font-medium block">{def.label}</label>
      <input
        id={`field-${def.key}`}
        type={def.secret ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={def.placeholder}
        autoComplete="off"
        className={cn('w-full px-3 py-2 text-xs bg-bg-secondary border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent',
          error ? 'border-sev-critical' : 'border-border')}
        data-testid={`field-${def.key}`}
      />
      {error
        ? <p className="text-[10px] text-sev-critical" data-testid="wizard-field-error">{error}</p>
        : <p className="text-[10px] text-text-muted">{def.help}</p>}
    </div>
  )
}
