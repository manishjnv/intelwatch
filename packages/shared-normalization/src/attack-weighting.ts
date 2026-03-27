/**
 * @module AttackWeighting
 * @description MITRE ATT&CK technique severity weighting for confidence scoring.
 * Curated severity map for the most commonly seen techniques in CTI feeds.
 * DECISION-029 Phase B1.
 */

export interface AttackTechniqueWeight {
  id: string;
  name: string;
  tactic: string;
  severity: number;
  category: 'high' | 'medium' | 'low';
}

function t(id: string, name: string, tactic: string, severity: number): AttackTechniqueWeight {
  const category = severity >= 80 ? 'high' : severity >= 50 ? 'medium' : 'low';
  return { id, name, tactic, severity, category };
}

const ATTACK_WEIGHTS: AttackTechniqueWeight[] = [
  // High severity (80-100)
  t('T1190', 'Exploit Public-Facing Application', 'initial-access', 95),
  t('T1059', 'Command and Scripting Interpreter', 'execution', 85),
  t('T1053', 'Scheduled Task/Job', 'persistence', 80),
  t('T1078', 'Valid Accounts', 'privilege-escalation', 90),
  t('T1003', 'OS Credential Dumping', 'credential-access', 90),
  t('T1486', 'Data Encrypted for Impact', 'impact', 95),
  t('T1071', 'Application Layer Protocol', 'command-and-control', 85),
  t('T1105', 'Ingress Tool Transfer', 'command-and-control', 80),
  t('T1027', 'Obfuscated Files', 'defense-evasion', 80),
  t('T1055', 'Process Injection', 'defense-evasion', 85),
  // Medium severity (50-79)
  t('T1566', 'Phishing', 'initial-access', 75),
  t('T1204', 'User Execution', 'execution', 65),
  t('T1547', 'Boot or Logon Autostart', 'persistence', 70),
  t('T1036', 'Masquerading', 'defense-evasion', 60),
  t('T1082', 'System Information Discovery', 'discovery', 50),
  t('T1018', 'Remote System Discovery', 'discovery', 55),
  t('T1021', 'Remote Services', 'lateral-movement', 70),
  t('T1041', 'Exfiltration Over C2 Channel', 'exfiltration', 75),
  t('T1568', 'Dynamic Resolution', 'command-and-control', 65),
  t('T1573', 'Encrypted Channel', 'command-and-control', 60),
  // Low severity (0-49)
  t('T1087', 'Account Discovery', 'discovery', 40),
  t('T1083', 'File and Directory Discovery', 'discovery', 35),
  t('T1057', 'Process Discovery', 'discovery', 30),
  t('T1012', 'Query Registry', 'discovery', 25),
  t('T1033', 'System Owner/User Discovery', 'discovery', 30),
  t('T1049', 'System Network Connections Discovery', 'discovery', 35),
  t('T1016', 'System Network Configuration Discovery', 'discovery', 30),
  t('T1007', 'System Service Discovery', 'discovery', 25),
  t('T1124', 'System Time Discovery', 'discovery', 20),
  t('T1497', 'Virtualization/Sandbox Evasion', 'defense-evasion', 45),
];

const WEIGHT_MAP = new Map<string, AttackTechniqueWeight>(
  ATTACK_WEIGHTS.map((w) => [w.id.toUpperCase(), w]),
);

export function getAttackWeight(techniqueId: string): AttackTechniqueWeight | null {
  const id = techniqueId.trim().toUpperCase();
  const direct = WEIGHT_MAP.get(id);
  if (direct) return direct;

  // Sub-technique fallback: T1059.001 → T1059
  const dotIdx = id.indexOf('.');
  if (dotIdx > 0) {
    return WEIGHT_MAP.get(id.slice(0, dotIdx)) ?? null;
  }
  return null;
}

export function calculateAttackSeverity(techniqueIds: string[]): number {
  if (techniqueIds.length === 0) return 0;

  const severities = techniqueIds.map((id) => {
    const w = getAttackWeight(id);
    return w ? w.severity : 50; // unknown → neutral 50
  });

  const max = Math.max(...severities);
  const avg = severities.reduce((sum, s) => sum + s, 0) / severities.length;
  return Math.round(max * 0.6 + avg * 0.4);
}

export function getAttackTacticSeverity(tactic: string): number {
  const lower = tactic.toLowerCase();
  const matches = ATTACK_WEIGHTS.filter((w) => w.tactic === lower);
  if (matches.length === 0) return 0;
  return Math.round(matches.reduce((sum, w) => sum + w.severity, 0) / matches.length);
}

export function listAttackTechniques(
  filter?: { tactic?: string; category?: 'high' | 'medium' | 'low' },
): AttackTechniqueWeight[] {
  let result = [...ATTACK_WEIGHTS];
  if (filter?.tactic) {
    const lower = filter.tactic.toLowerCase();
    result = result.filter((w) => w.tactic === lower);
  }
  if (filter?.category) {
    result = result.filter((w) => w.category === filter.category);
  }
  return result;
}
