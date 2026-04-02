/**
 * @module components/ioc/CreateIocModal
 * @description Manual IOC submission modal — auto-detects type via regex,
 * validates with Zod, stubs POST submission (backend pending).
 */
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Plus, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from '@/components/ui/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { IOC_PATTERNS, SEVERITY_LEVELS, TLP_LEVELS } from './ioc-constants'

const createIocSchema = z.object({
  value: z.string().min(1, 'IOC value is required'),
  iocType: z.string().min(1, 'Type is required'),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  tlp: z.enum(['red', 'amber', 'green', 'white']),
  confidence: z.number().min(0).max(100),
  tags: z.string(),
  notes: z.string().optional(),
})

type CreateIocForm = z.infer<typeof createIocSchema>

/** Detect IOC type from raw value using regex patterns. */
function detectIocType(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  for (const [type, pattern] of Object.entries(IOC_PATTERNS)) {
    if (pattern.test(trimmed)) return type
  }
  return null
}

interface CreateIocModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateIocModal({ isOpen, onClose }: CreateIocModalProps) {
  const qc = useQueryClient()
  const [detectedType, setDetectedType] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateIocForm>({
    resolver: zodResolver(createIocSchema),
    defaultValues: { value: '', iocType: '', severity: 'medium', tlp: 'amber', confidence: 50, tags: '', notes: '' },
  })

  const watchedValue = watch('value')

  // Auto-detect IOC type on value change
  useEffect(() => {
    const detected = detectIocType(watchedValue)
    setDetectedType(detected)
    if (detected) setValue('iocType', detected)
  }, [watchedValue, setValue])

  const onSubmit = (data: CreateIocForm) => {
    // Backend POST /api/v1/iocs does not exist yet — stub submission
    console.warn('[STUB] POST /iocs not implemented. Payload:', {
      ...data,
      tags: data.tags.split(',').map(t => t.trim()).filter(Boolean),
    })
    toast('IOC queued for submission (backend pending)', 'success')
    qc.invalidateQueries({ queryKey: ['iocs'] })
    reset()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
              data-testid="create-ioc-modal" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Plus className="w-4 h-4 text-accent" />Add IOC
                </h2>
                <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
                {/* IOC Value */}
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">IOC Value</label>
                  <div className="relative">
                    <input {...register('value')} placeholder="e.g. 185.220.101.34, evil.com, CVE-2024-1234"
                      className="w-full px-3 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                      data-testid="ioc-value-input" autoFocus />
                    {detectedType && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent" data-testid="detected-type">
                        <Sparkles className="w-3 h-3" />{detectedType}
                      </span>
                    )}
                  </div>
                  {errors.value && <p className="text-[10px] text-sev-critical mt-1">{errors.value.message}</p>}
                </div>

                {/* Type override */}
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">Type</label>
                  <select {...register('iocType')} data-testid="ioc-type-select"
                    className="w-full px-3 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50">
                    <option value="">Select type…</option>
                    {Object.keys(IOC_PATTERNS).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors.iocType && <p className="text-[10px] text-sev-critical mt-1">{errors.iocType.message}</p>}
                </div>

                {/* Severity + TLP + Confidence row */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">Severity</label>
                    <select {...register('severity')}
                      className="w-full px-2 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50">
                      {SEVERITY_LEVELS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">TLP</label>
                    <select {...register('tlp')}
                      className="w-full px-2 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50">
                      {TLP_LEVELS.map(t => <option key={t} value={t} className="uppercase">{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">Confidence</label>
                    <input {...register('confidence', { valueAsNumber: true })} type="number" min={0} max={100}
                      className="w-full px-2 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50" />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">Tags (comma-separated)</label>
                  <input {...register('tags')} placeholder="apt, c2, phishing"
                    className="w-full px-3 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50" />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">Notes (optional)</label>
                  <textarea {...register('notes')} rows={2} placeholder="Additional context…"
                    className="w-full px-3 py-2 text-xs rounded-md bg-bg-secondary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none" />
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={onClose}
                    className="px-4 py-2 text-xs rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors">
                    Cancel
                  </button>
                  <button type="submit" data-testid="create-ioc-submit"
                    className="px-4 py-2 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors font-medium">
                    Add IOC
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
