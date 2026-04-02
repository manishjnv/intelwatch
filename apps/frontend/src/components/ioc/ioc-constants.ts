/**
 * @module components/ioc/ioc-constants
 * @description IOC filter definitions, type detection patterns, lifecycle states.
 */
import type { FilterOption } from '@/components/data/FilterBar'

export const IOC_FILTERS: FilterOption[] = [
  { key: 'iocType', label: 'Type', options: [
    { value: 'ip', label: 'IP' }, { value: 'domain', label: 'Domain' },
    { value: 'url', label: 'URL' }, { value: 'hash_sha256', label: 'SHA-256' },
    { value: 'hash_md5', label: 'MD5' }, { value: 'cve', label: 'CVE' },
    { value: 'email', label: 'Email' },
  ]},
  { key: 'severity', label: 'Severity', options: [
    { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
    { value: 'info', label: 'Info' },
  ]},
  { key: 'lifecycle', label: 'Lifecycle', options: [
    { value: 'new', label: 'New' }, { value: 'active', label: 'Active' },
    { value: 'aging', label: 'Aging' }, { value: 'expired', label: 'Expired' },
  ]},
  { key: 'source', label: 'Source', options: [
    { value: 'global', label: 'Global' }, { value: 'private', label: 'Private' },
  ]},
  { key: 'hasCampaign', label: 'Campaign', options: [
    { value: 'true', label: 'Campaign IOCs only' },
  ]},
]

/** Regex patterns for auto-detecting IOC type from raw value. */
export const IOC_PATTERNS: Record<string, RegExp> = {
  ip: /^(\d{1,3}\.){3}\d{1,3}$/,
  cve: /^CVE-\d{4}-\d{4,}$/i,
  hash_sha256: /^[a-fA-F0-9]{64}$/,
  hash_md5: /^[a-fA-F0-9]{32}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  domain: /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
}

export const LIFECYCLE_STATES = ['new', 'active', 'aging', 'expired'] as const
export type LifecycleState = (typeof LIFECYCLE_STATES)[number]

export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const
export const TLP_LEVELS = ['red', 'amber', 'green', 'white'] as const

/** MITRE ATT&CK tactic → color mapping for TTP badges */
export const TACTIC_COLORS: Record<string, string> = {
  'reconnaissance':       'bg-red-500/15 text-red-300 border-red-500/25',
  'resource-development': 'bg-red-500/15 text-red-300 border-red-500/25',
  'initial-access':       'bg-red-500/15 text-red-300 border-red-500/25',
  'execution':            'bg-orange-500/15 text-orange-300 border-orange-500/25',
  'persistence':          'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  'privilege-escalation': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'defense-evasion':      'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'credential-access':    'bg-pink-500/15 text-pink-300 border-pink-500/25',
  'discovery':            'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'lateral-movement':     'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  'collection':           'bg-teal-500/15 text-teal-300 border-teal-500/25',
  'command-and-control':  'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  'exfiltration':         'bg-rose-500/15 text-rose-300 border-rose-500/25',
  'impact':               'bg-slate-500/15 text-slate-300 border-slate-500/25',
}

/** Well-known MITRE technique ID → name + tactic lookup */
export const TECHNIQUE_CATALOG: Record<string, { name: string; tactic: string }> = {
  'T1071':     { name: 'Application Layer Protocol', tactic: 'command-and-control' },
  'T1071.001': { name: 'Web Protocols', tactic: 'command-and-control' },
  'T1071.004': { name: 'DNS', tactic: 'command-and-control' },
  'T1059':     { name: 'Command and Scripting Interpreter', tactic: 'execution' },
  'T1059.001': { name: 'PowerShell', tactic: 'execution' },
  'T1059.003': { name: 'Windows Command Shell', tactic: 'execution' },
  'T1190':     { name: 'Exploit Public-Facing Application', tactic: 'initial-access' },
  'T1566':     { name: 'Phishing', tactic: 'initial-access' },
  'T1566.001': { name: 'Spearphishing Attachment', tactic: 'initial-access' },
  'T1566.002': { name: 'Spearphishing Link', tactic: 'initial-access' },
  'T1027':     { name: 'Obfuscated Files or Information', tactic: 'defense-evasion' },
  'T1053':     { name: 'Scheduled Task/Job', tactic: 'persistence' },
  'T1105':     { name: 'Ingress Tool Transfer', tactic: 'command-and-control' },
  'T1133':     { name: 'External Remote Services', tactic: 'initial-access' },
  'T1203':     { name: 'Exploitation for Client Execution', tactic: 'execution' },
  'T1204':     { name: 'User Execution', tactic: 'execution' },
  'T1486':     { name: 'Data Encrypted for Impact', tactic: 'impact' },
  'T1547':     { name: 'Boot or Logon Autostart Execution', tactic: 'persistence' },
  'T1548':     { name: 'Abuse Elevation Control Mechanism', tactic: 'privilege-escalation' },
  'T1562':     { name: 'Impair Defenses', tactic: 'defense-evasion' },
  'T1070':     { name: 'Indicator Removal', tactic: 'defense-evasion' },
  'T1110':     { name: 'Brute Force', tactic: 'credential-access' },
  'T1046':     { name: 'Network Service Discovery', tactic: 'discovery' },
  'T1021':     { name: 'Remote Services', tactic: 'lateral-movement' },
  'T1041':     { name: 'Exfiltration Over C2 Channel', tactic: 'exfiltration' },
}
