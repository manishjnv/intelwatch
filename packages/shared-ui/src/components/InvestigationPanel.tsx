// ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
// Width (480px), z-index (z-50), animation values, section order,
// and the 8 action buttons are ALL FROZEN.
// Do NOT modify without [DESIGN-APPROVED] in your Claude prompt.

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, GitBranch, Plus, Download, Bell, Tag, Globe, Archive } from 'lucide-react'
import type { EntityType, Severity } from './EntityChip'

interface InvestigationPanelProps {
  open: boolean
  onClose: () => void
  entityType: EntityType
  entityValue: string
  severity?: Severity
}

// ⛔ FROZEN — 8 action buttons, order and icons locked (UI_DESIGN_LOCK.md)
const INVESTIGATION_ACTIONS = [
  { icon: Search,   label: 'Pivot Search',         key: 'pivotSearch'       },
  { icon: GitBranch,label: 'View in Graph',         key: 'openGraph'         },
  { icon: Plus,     label: 'Add to Investigation',  key: 'addToInvestigation'},
  { icon: Download, label: 'Export Entity',         key: 'exportEntity'      },
  { icon: Bell,     label: 'Create Alert Rule',     key: 'createAlertRule'   },
  { icon: Tag,      label: 'Manage Tags',           key: 'manageTags'        },
  { icon: Globe,    label: 'Internet Lookup',       key: 'internetSearch'    },
  { icon: Archive,  label: 'Archive Entity',        key: 'archiveEntity'     },
] as const

export function InvestigationPanel({ open, onClose, entityType, entityValue, severity }: InvestigationPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* ⛔ FROZEN — width: 480px, position: fixed right-0 top-0, z-50 */}
          <motion.div
            className="fixed right-0 top-0 h-full z-50 bg-[var(--bg-elevated)] border-l border-[var(--border)] flex flex-col overflow-hidden"
            style={{ width: 480 }} // ⛔ FROZEN: exactly 480px
            // ⛔ FROZEN animation: x 100%→0, 0.25s easeOut
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.25, ease: 'easeOut' } }}
            exit={{ x: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{entityType}</span>
                {severity && <span className="text-xs text-[var(--sev-high)]">{severity}</span>}
              </div>
              <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Entity value */}
            <div className="px-4 py-3 border-b border-[var(--border)] shrink-0">
              <p className="text-sm font-mono text-[var(--text-primary)] break-all">{entityValue}</p>
            </div>

            {/* ⛔ FROZEN — 8 action buttons row */}
            <div className="grid grid-cols-4 gap-1 px-3 py-2 border-b border-[var(--border)] shrink-0">
              {INVESTIGATION_ACTIONS.map(({ icon: Icon, label, key }) => (
                <button
                  key={key}
                  className="flex flex-col items-center gap-1 p-2 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  title={label}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[9px] leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>

            {/* ⛔ FROZEN — section order: entity-header → enrichment-summary → related-* → timeline */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
              {/* Enrichment Summary */}
              <PanelSection title="AI Enrichment">
                <div className="animate-pulse space-y-2">
                  <div className="h-3 bg-[var(--bg-hover)] rounded w-3/4" />
                  <div className="h-3 bg-[var(--bg-hover)] rounded w-1/2" />
                </div>
              </PanelSection>

              {/* Related IOCs */}
              <PanelSection title="Related IOCs">
                <PanelSkeleton />
              </PanelSection>

              {/* Related Actors */}
              <PanelSection title="Threat Actors">
                <PanelSkeleton />
              </PanelSection>

              {/* Related Malware */}
              <PanelSection title="Malware Families">
                <PanelSkeleton />
              </PanelSection>

              {/* Related Campaigns */}
              <PanelSection title="Campaigns">
                <PanelSkeleton />
              </PanelSection>

              {/* Related Vulnerabilities */}
              <PanelSection title="Vulnerabilities">
                <PanelSkeleton />
              </PanelSection>

              {/* Activity Timeline */}
              <PanelSection title="Activity Timeline">
                <PanelSkeleton />
              </PanelSection>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true)
  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left mb-2"
      >
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{title}</span>
        <span className="text-[var(--text-muted)] text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="text-xs text-[var(--text-secondary)]">{children}</div>}
    </div>
  )
}

// ⛔ FROZEN: skeleton screen is mandatory (never spinner) for loading states
function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5">
      <div className="h-2.5 bg-[var(--bg-hover)] rounded w-full" />
      <div className="h-2.5 bg-[var(--bg-hover)] rounded w-4/5" />
      <div className="h-2.5 bg-[var(--bg-hover)] rounded w-2/3" />
    </div>
  )
}
