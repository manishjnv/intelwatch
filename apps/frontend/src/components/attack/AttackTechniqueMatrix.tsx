/**
 * @module components/attack/AttackTechniqueMatrix
 * @description MITRE ATT&CK technique table grouped by tactic.
 * Techniques colored by severity (high=red, medium=amber, low=blue).
 * Click technique → external link to MITRE ATT&CK page.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

export interface AttackTechnique {
  techniqueId: string   // e.g. T1059, T1059.001
  name?: string
  tactic?: string
  severity?: 'high' | 'medium' | 'low'
  description?: string
}

export interface AttackTechniqueMatrixProps {
  techniques: AttackTechnique[] | string[]
  entityName: string
  entityType: 'actor' | 'malware' | 'campaign'
}

// ─── Tactic ordering (MITRE Kill Chain) ──────────────────────────

const TACTICS = [
  'reconnaissance', 'resource-development', 'initial-access', 'execution',
  'persistence', 'privilege-escalation', 'defense-evasion', 'credential-access',
  'discovery', 'lateral-movement', 'collection', 'command-and-control',
  'exfiltration', 'impact',
] as const

const TACTIC_LABELS: Record<string, string> = {
  'reconnaissance': 'Recon',
  'resource-development': 'Resource Dev',
  'initial-access': 'Initial Access',
  'execution': 'Execution',
  'persistence': 'Persistence',
  'privilege-escalation': 'Priv Esc',
  'defense-evasion': 'Defense Evasion',
  'credential-access': 'Cred Access',
  'discovery': 'Discovery',
  'lateral-movement': 'Lateral Mvmt',
  'collection': 'Collection',
  'command-and-control': 'C2',
  'exfiltration': 'Exfiltration',
  'impact': 'Impact',
}

// ─── Technique ID → tactic mapping (common mappings) ─────────────

const TECHNIQUE_TACTICS: Record<string, string> = {
  'T1190': 'initial-access', 'T1566': 'initial-access', 'T1133': 'initial-access',
  'T1059': 'execution', 'T1204': 'execution', 'T1203': 'execution',
  'T1078': 'persistence', 'T1543': 'persistence', 'T1547': 'persistence',
  'T1548': 'privilege-escalation', 'T1068': 'privilege-escalation',
  'T1027': 'defense-evasion', 'T1070': 'defense-evasion', 'T1036': 'defense-evasion',
  'T1003': 'credential-access', 'T1110': 'credential-access', 'T1558': 'credential-access',
  'T1018': 'discovery', 'T1082': 'discovery', 'T1083': 'discovery',
  'T1021': 'lateral-movement', 'T1570': 'lateral-movement',
  'T1005': 'collection', 'T1119': 'collection', 'T1039': 'collection',
  'T1071': 'command-and-control', 'T1105': 'command-and-control', 'T1572': 'command-and-control',
  'T1041': 'exfiltration', 'T1567': 'exfiltration',
  'T1486': 'impact', 'T1489': 'impact', 'T1490': 'impact',
}

// ─── Technique ID → name mapping (common) ────────────────────────

const TECHNIQUE_NAMES: Record<string, string> = {
  'T1190': 'Exploit Public-Facing App', 'T1566': 'Phishing', 'T1133': 'External Remote Services',
  'T1059': 'Command & Scripting', 'T1204': 'User Execution', 'T1203': 'Exploitation for Client',
  'T1078': 'Valid Accounts', 'T1543': 'Create/Modify System Process', 'T1547': 'Boot/Logon Autostart',
  'T1548': 'Abuse Elevation', 'T1068': 'Exploitation for Priv Esc',
  'T1027': 'Obfuscated Files', 'T1070': 'Indicator Removal', 'T1036': 'Masquerading',
  'T1003': 'OS Credential Dumping', 'T1110': 'Brute Force', 'T1558': 'Kerberoasting',
  'T1018': 'Remote System Discovery', 'T1082': 'System Info Discovery', 'T1083': 'File Discovery',
  'T1021': 'Remote Services', 'T1570': 'Lateral Tool Transfer',
  'T1005': 'Data from Local System', 'T1119': 'Automated Collection',
  'T1071': 'Application Layer Proto', 'T1105': 'Ingress Tool Transfer', 'T1572': 'Protocol Tunneling',
  'T1041': 'Exfil Over C2', 'T1567': 'Exfil Over Web Service',
  'T1486': 'Data Encrypted for Impact', 'T1489': 'Service Stop', 'T1490': 'Inhibit Recovery',
}

const SEV_COLORS: Record<string, string> = {
  high: 'bg-sev-critical/10 text-sev-critical border-sev-critical/20',
  medium: 'bg-sev-medium/10 text-sev-medium border-sev-medium/20',
  low: 'bg-accent/10 text-accent border-accent/20',
}

// ─── Normalize techniques to AttackTechnique[] ───────────────────

function normalizeTechniques(input: AttackTechnique[] | string[]): AttackTechnique[] {
  return input.map(t => {
    if (typeof t === 'string') {
      const baseId = t.split('.')[0]
      return {
        techniqueId: t,
        name: TECHNIQUE_NAMES[baseId] ?? t,
        tactic: TECHNIQUE_TACTICS[baseId] ?? 'execution',
        severity: 'medium' as const,
      }
    }
    // Fill in missing fields
    const baseId = t.techniqueId.split('.')[0]
    return {
      ...t,
      name: t.name || TECHNIQUE_NAMES[baseId] || t.techniqueId,
      tactic: t.tactic || TECHNIQUE_TACTICS[baseId] || 'execution',
      severity: t.severity || 'medium',
    }
  })
}

// ─── Component ──────────────────────────────────────────────────

export function AttackTechniqueMatrix({
  techniques,
  entityName,
  entityType: _entityType,
}: AttackTechniqueMatrixProps) {
  const normalized = useMemo(() => normalizeTechniques(techniques), [techniques])

  // Group by tactic
  const grouped = useMemo(() => {
    const map = new Map<string, AttackTechnique[]>()
    for (const t of normalized) {
      const tactic = t.tactic ?? 'execution'
      if (!map.has(tactic)) map.set(tactic, [])
      map.get(tactic)!.push(t)
    }
    return map
  }, [normalized])

  const coveredTactics = grouped.size
  const totalTechniques = normalized.length

  if (totalTechniques === 0) {
    return (
      <div className="p-3 text-[10px] text-text-muted" data-testid="attack-matrix-empty">
        No ATT&CK techniques mapped for {entityName}
      </div>
    )
  }

  return (
    <div data-testid="attack-technique-matrix" className="space-y-2">
      {/* Technique table grouped by tactic */}
      <div className="overflow-x-auto -mx-3 px-3">
        <div className="space-y-1.5 min-w-[280px]">
          {TACTICS.filter(t => grouped.has(t)).map(tactic => (
            <div key={tactic} data-testid={`tactic-${tactic}`}>
              <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-0.5">
                {TACTIC_LABELS[tactic] ?? tactic}
              </div>
              <div className="flex flex-wrap gap-1">
                {grouped.get(tactic)!.map(tech => (
                  <a
                    key={tech.techniqueId}
                    href={`https://attack.mitre.org/techniques/${tech.techniqueId.replace('.', '/')}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${tech.techniqueId}: ${tech.name}${tech.description ? ` — ${tech.description}` : ''}`}
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-mono transition-opacity hover:opacity-80',
                      SEV_COLORS[tech.severity ?? 'medium'],
                    )}
                    data-testid="technique-cell"
                  >
                    {tech.techniqueId}
                    <span className="font-sans text-[9px] max-w-[120px] truncate opacity-75">{tech.name}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer: coverage summary */}
      <div className="flex items-center justify-between text-[10px] text-text-muted pt-1 border-t border-border" data-testid="attack-matrix-footer">
        <span>Covers {coveredTactics}/{TACTICS.length} tactics, {totalTechniques} technique{totalTechniques !== 1 ? 's' : ''}</span>
        <span>MITRE ATT&CK Framework</span>
      </div>
    </div>
  )
}
