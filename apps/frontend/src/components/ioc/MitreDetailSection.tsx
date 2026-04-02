/**
 * @module components/ioc/MitreDetailSection
 * @description Expandable MITRE ATT&CK section for IOC detail panel.
 * Groups techniques by tactic, shows full names, links to MITRE site.
 */
import { useState, useMemo } from 'react'
import { ChevronDown, ExternalLink, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TECHNIQUE_CATALOG, TACTIC_COLORS } from '@/components/ioc/ioc-constants'

interface MitreDetailSectionProps {
  techniques: string[]
  className?: string
}

interface TacticGroup {
  tactic: string
  label: string
  techniques: Array<{ id: string; name: string }>
}

const TACTIC_DISPLAY: Record<string, string> = {
  'reconnaissance': 'Reconnaissance',
  'resource-development': 'Resource Development',
  'initial-access': 'Initial Access',
  'execution': 'Execution',
  'persistence': 'Persistence',
  'privilege-escalation': 'Privilege Escalation',
  'defense-evasion': 'Defense Evasion',
  'credential-access': 'Credential Access',
  'discovery': 'Discovery',
  'lateral-movement': 'Lateral Movement',
  'collection': 'Collection',
  'command-and-control': 'Command & Control',
  'exfiltration': 'Exfiltration',
  'impact': 'Impact',
}

export function MitreDetailSection({ techniques, className }: MitreDetailSectionProps) {
  const [open, setOpen] = useState(true)

  const groups = useMemo(() => {
    const map = new Map<string, TacticGroup>()
    for (const tid of techniques) {
      const info = TECHNIQUE_CATALOG[tid]
      const tactic = info?.tactic ?? 'unknown'
      if (!map.has(tactic)) {
        map.set(tactic, { tactic, label: TACTIC_DISPLAY[tactic] ?? tactic, techniques: [] })
      }
      map.get(tactic)!.techniques.push({ id: tid, name: info?.name ?? tid })
    }
    return Array.from(map.values())
  }, [techniques])

  if (!techniques.length) return null

  return (
    <div className={`border border-border rounded-lg overflow-hidden ${className ?? ''}`} data-testid="mitre-detail-section">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-bg-elevated hover:bg-bg-hover transition-colors text-xs font-medium text-text-primary"
      >
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-red-400" />
          MITRE ATT&CK ({techniques.length} techniques)
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="p-3 space-y-3 bg-bg-primary">
              {groups.map(g => (
                <div key={g.tactic}>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">{g.label}</div>
                  <div className="space-y-1">
                    {g.techniques.map(t => {
                      const colorClass = TACTIC_COLORS[g.tactic] ?? ''
                      return (
                        <a
                          key={t.id}
                          href={`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between px-2 py-1 rounded border text-xs hover:opacity-80 transition-opacity ${colorClass}`}
                          data-testid="mitre-technique-link"
                        >
                          <span>
                            <span className="font-mono font-semibold mr-1.5">{t.id}</span>
                            {t.name}
                          </span>
                          <ExternalLink className="w-3 h-3 shrink-0 ml-2 opacity-50" />
                        </a>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
