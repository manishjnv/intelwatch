/**
 * #8 — Kill Chain Phase Correlation
 * Maps entities to Lockheed Martin Cyber Kill Chain phases via MITRE ATT&CK tactics.
 * Detects multi-phase campaigns spanning 3+ phases.
 */
import type {
  CorrelatedIOC, KillChainCoverage, KillChainPhase,
} from '../schemas/correlation.js';

/**
 * MITRE ATT&CK Tactic IDs → Kill Chain Phase mapping
 * Based on MITRE ATT&CK Enterprise tactics (TA0001-TA0043)
 */
const TACTIC_TO_PHASE: Record<string, KillChainPhase> = {
  'TA0043': 'reconnaissance',        // Reconnaissance
  'TA0042': 'weaponization',          // Resource Development
  'TA0001': 'delivery',              // Initial Access
  'TA0002': 'exploitation',          // Execution
  'TA0003': 'installation',          // Persistence
  'TA0004': 'exploitation',          // Privilege Escalation
  'TA0005': 'installation',          // Defense Evasion
  'TA0006': 'exploitation',          // Credential Access
  'TA0007': 'reconnaissance',        // Discovery
  'TA0008': 'installation',          // Lateral Movement
  'TA0009': 'actions_on_objectives', // Collection
  'TA0011': 'command_and_control',   // Command and Control
  'TA0010': 'actions_on_objectives', // Exfiltration
  'TA0040': 'actions_on_objectives', // Impact
};

/**
 * Technique ID prefix → Tactic mapping (for technique IDs like T1566, T1059)
 * Maps common technique prefixes to their primary tactic.
 */
const TECHNIQUE_TACTIC_MAP: Record<string, string> = {
  'T1595': 'TA0043', 'T1592': 'TA0043', 'T1589': 'TA0043', // Recon
  'T1583': 'TA0042', 'T1584': 'TA0042', 'T1587': 'TA0042', // Resource Dev
  'T1566': 'TA0001', 'T1190': 'TA0001', 'T1133': 'TA0001', // Initial Access
  'T1059': 'TA0002', 'T1203': 'TA0002', 'T1204': 'TA0002', // Execution
  'T1547': 'TA0003', 'T1053': 'TA0003', 'T1136': 'TA0003', // Persistence
  'T1548': 'TA0004', 'T1134': 'TA0004',                     // Priv Esc
  'T1070': 'TA0005', 'T1036': 'TA0005', 'T1027': 'TA0005', // Defense Evasion
  'T1110': 'TA0006', 'T1003': 'TA0006',                     // Cred Access
  'T1082': 'TA0007', 'T1083': 'TA0007', 'T1057': 'TA0007', // Discovery
  'T1021': 'TA0008', 'T1570': 'TA0008',                     // Lateral Movement
  'T1005': 'TA0009', 'T1119': 'TA0009', 'T1074': 'TA0009', // Collection
  'T1071': 'TA0011', 'T1573': 'TA0011', 'T1105': 'TA0011', // C2
  'T1041': 'TA0010', 'T1048': 'TA0010',                     // Exfiltration
  'T1486': 'TA0040', 'T1490': 'TA0040', 'T1485': 'TA0040', // Impact
};

export class KillChainService {
  /** Map a single MITRE technique ID to a Kill Chain phase */
  techniqueToPhase(techniqueId: string): KillChainPhase | null {
    // Direct tactic ID match (TA0001-TA0043)
    if (techniqueId.startsWith('TA')) {
      return TACTIC_TO_PHASE[techniqueId] ?? null;
    }

    // Technique ID lookup (T1566 → TA0001 → delivery)
    const baseId = techniqueId.split('.')[0]!; // Handle sub-techniques like T1566.001
    const tacticId = TECHNIQUE_TACTIC_MAP[baseId];
    if (tacticId) {
      return TACTIC_TO_PHASE[tacticId] ?? null;
    }

    return null;
  }

  /** Map all techniques of an entity to Kill Chain phases */
  mapEntityPhases(techniques: string[]): KillChainPhase[] {
    const phases = new Set<KillChainPhase>();
    for (const tech of techniques) {
      const phase = this.techniqueToPhase(tech);
      if (phase) phases.add(phase);
    }
    return Array.from(phases);
  }

  /** Compute Kill Chain coverage for a tenant's IOCs */
  computeCoverage(tenantId: string, iocs: Map<string, CorrelatedIOC>): KillChainCoverage {
    const phases: Record<string, { count: number; entityIds: string[]; techniques: string[] }> = {};

    // Initialize all phases
    for (const phase of ['reconnaissance', 'weaponization', 'delivery', 'exploitation',
      'installation', 'command_and_control', 'actions_on_objectives']) {
      phases[phase] = { count: 0, entityIds: [], techniques: [] };
    }

    // Map each IOC's techniques to phases
    for (const ioc of iocs.values()) {
      if (ioc.tenantId !== tenantId) continue;
      if (ioc.mitreAttack.length === 0) continue;

      for (const tech of ioc.mitreAttack) {
        const phase = this.techniqueToPhase(tech);
        if (phase && phases[phase]) {
          phases[phase]!.count++;
          if (!phases[phase]!.entityIds.includes(ioc.id)) {
            phases[phase]!.entityIds.push(ioc.id);
          }
          if (!phases[phase]!.techniques.includes(tech)) {
            phases[phase]!.techniques.push(tech);
          }
        }
      }
    }

    // Count multi-phase campaigns (IOCs spanning 3+ phases)
    const iocPhaseCount = new Map<string, Set<string>>();
    for (const ioc of iocs.values()) {
      if (ioc.tenantId !== tenantId) continue;
      const entityPhases = new Set<string>();
      for (const tech of ioc.mitreAttack) {
        const phase = this.techniqueToPhase(tech);
        if (phase) entityPhases.add(phase);
      }
      if (entityPhases.size >= 3) {
        iocPhaseCount.set(ioc.id, entityPhases);
      }
    }

    return {
      tenantId,
      phases,
      multiPhaseCampaigns: iocPhaseCount.size,
    };
  }
}
