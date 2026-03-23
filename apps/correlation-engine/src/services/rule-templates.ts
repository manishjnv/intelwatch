/**
 * #12 — Correlation Rule Template Library
 * Pre-built detection templates for APT, ransomware, C2, supply chain,
 * credential harvesting, and lateral movement scenarios.
 * Each template has MITRE ATT&CK mappings, graduated severity thresholds,
 * and effectiveness tracking (TP/FP counts).
 */
import type {
  CorrelatedIOC, CorrelationResult, RuleTemplate, TemplateMatch,
  TemplateCondition, Severity,
} from '../schemas/correlation.js';

// ── Template Definitions ────────────────────────────────────────

function buildTemplates(): RuleTemplate[] {
  return [
    {
      id: 'apt-infra-reuse',
      name: 'APT Infrastructure Reuse',
      description: 'Detects shared C2 infrastructure (ASN/CIDR overlap) combined with specific ATT&CK techniques indicative of APT operations.',
      category: 'apt',
      mitreTechniques: ['T1071', 'T1071.001', 'T1059', 'T1005'],
      requiredConditions: [
        { type: 'ttp_match', value: 'T1071,T1059,T1005', threshold: 0.3 },
        { type: 'infra_overlap', value: 'asn_cidr', threshold: 0.4 },
        { type: 'temporal_proximity', value: 'hours', threshold: 0.5 },
        { type: 'feed_overlap', value: 'multi_source', threshold: 0.3 },
      ],
      severityThresholds: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 },
      tpCount: 0, fpCount: 0,
    },
    {
      id: 'ransomware-kill-chain',
      name: 'Ransomware Kill Chain',
      description: 'Identifies ransomware patterns: encryption tool IOCs, data exfiltration, and double extortion indicators.',
      category: 'ransomware',
      mitreTechniques: ['T1486', 'T1567', 'T1048', 'T1490'],
      requiredConditions: [
        { type: 'ttp_match', value: 'T1486,T1567,T1048', threshold: 0.4 },
        { type: 'temporal_proximity', value: 'hours', threshold: 0.5 },
        { type: 'feed_overlap', value: 'multi_source', threshold: 0.2 },
      ],
      severityThresholds: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 3 },
      tpCount: 0, fpCount: 0,
    },
    {
      id: 'c2-beaconing',
      name: 'C2 Beaconing',
      description: 'Detects periodic communication patterns and known C2 framework indicators.',
      category: 'c2',
      mitreTechniques: ['T1071', 'T1573', 'T1095', 'T1571'],
      requiredConditions: [
        { type: 'temporal_proximity', value: 'periodic', threshold: 0.6 },
        { type: 'ttp_match', value: 'T1071,T1573,T1095', threshold: 0.3 },
        { type: 'infra_overlap', value: 'asn_cidr', threshold: 0.3 },
      ],
      severityThresholds: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 3 },
      tpCount: 0, fpCount: 0,
    },
    {
      id: 'supply-chain',
      name: 'Supply Chain Compromise',
      description: 'Identifies typosquatting domains, dependency confusion, and compromised update channels.',
      category: 'supply_chain',
      mitreTechniques: ['T1195', 'T1199', 'T1195.002'],
      requiredConditions: [
        { type: 'ttp_match', value: 'T1195,T1199', threshold: 0.2 },
        { type: 'feed_overlap', value: 'multi_source', threshold: 0.4 },
        { type: 'infra_overlap', value: 'registrar', threshold: 0.3 },
      ],
      severityThresholds: { LOW: 1, MEDIUM: 2, HIGH: 2, CRITICAL: 3 },
      tpCount: 0, fpCount: 0,
    },
    {
      id: 'credential-harvest',
      name: 'Credential Harvesting',
      description: 'Detects phishing domains combined with credential access techniques and high-volume temporal waves.',
      category: 'credential',
      mitreTechniques: ['T1566', 'T1078', 'T1110', 'T1003'],
      requiredConditions: [
        { type: 'ttp_match', value: 'T1566,T1078,T1110', threshold: 0.3 },
        { type: 'temporal_proximity', value: 'burst', threshold: 0.4 },
        { type: 'feed_overlap', value: 'multi_source', threshold: 0.3 },
      ],
      severityThresholds: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 3 },
      tpCount: 0, fpCount: 0,
    },
    {
      id: 'lateral-movement',
      name: 'Lateral Movement',
      description: 'Detects internal IP correlations with movement TTPs and sequential timing patterns.',
      category: 'lateral',
      mitreTechniques: ['T1021', 'T1570', 'T1210', 'T1550'],
      requiredConditions: [
        { type: 'ttp_match', value: 'T1021,T1570,T1210', threshold: 0.3 },
        { type: 'temporal_proximity', value: 'sequential', threshold: 0.5 },
        { type: 'infra_overlap', value: 'cidr', threshold: 0.4 },
      ],
      severityThresholds: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 3 },
      tpCount: 0, fpCount: 0,
    },
  ];
}

// ── Service ─────────────────────────────────────────────────────

export class RuleTemplateService {
  private readonly templates: Map<string, RuleTemplate>;

  constructor() {
    this.templates = new Map();
    for (const t of buildTemplates()) {
      this.templates.set(t.id, t);
    }
  }

  /** Get all templates. */
  listTemplates(): RuleTemplate[] {
    return Array.from(this.templates.values());
  }

  /** Get template by ID. */
  getTemplate(id: string): RuleTemplate | null {
    return this.templates.get(id) ?? null;
  }

  /** Evaluate a single template against IOCs and existing correlation results. */
  evaluateTemplate(
    templateId: string,
    iocs: Map<string, CorrelatedIOC>,
    existingResults: CorrelationResult[],
  ): TemplateMatch | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const iocArr = Array.from(iocs.values());
    if (iocArr.length === 0) return null;

    const matchedConditions: TemplateMatch['matchedConditions'] = [];
    let matchedCount = 0;

    for (const condition of template.requiredConditions) {
      const result = this.evaluateCondition(condition, iocArr, existingResults, template.mitreTechniques);
      const matched = result.score >= condition.threshold;
      if (matched) matchedCount++;
      matchedConditions.push({ condition, matched, actualValue: result.score });
    }

    if (matchedCount === 0) return null;

    const severity = this.computeSeverity(matchedCount, template.severityThresholds);
    const score = Math.round((matchedCount / template.requiredConditions.length) * 1000) / 1000;
    const matchedEntityIds = this.collectMatchedEntityIds(iocArr, template.mitreTechniques);

    return {
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      severity,
      score,
      matchedConditions,
      matchedEntityIds,
    };
  }

  /** Evaluate all templates. Returns only templates with at least one matching condition. */
  evaluateAllTemplates(
    iocs: Map<string, CorrelatedIOC>,
    existingResults: CorrelationResult[],
  ): TemplateMatch[] {
    const matches: TemplateMatch[] = [];
    for (const template of this.templates.values()) {
      const match = this.evaluateTemplate(template.id, iocs, existingResults);
      if (match) matches.push(match);
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  /** Update effectiveness stats from analyst FP/TP feedback. */
  recordFeedback(templateId: string, verdict: 'true_positive' | 'false_positive'): void {
    const template = this.templates.get(templateId);
    if (!template) return;
    if (verdict === 'true_positive') template.tpCount++;
    else template.fpCount++;
  }

  // ── Private condition evaluators ──────────────────────────────

  private evaluateCondition(
    condition: TemplateCondition,
    iocs: CorrelatedIOC[],
    existingResults: CorrelationResult[],
    templateTechniques: string[],
  ): { score: number } {
    switch (condition.type) {
      case 'ttp_match':
        return this.evaluateTTPMatch(iocs, templateTechniques);
      case 'infra_overlap':
        return this.evaluateInfraOverlap(iocs);
      case 'temporal_proximity':
        return this.evaluateTemporalProximity(iocs);
      case 'feed_overlap':
        return this.evaluateFeedOverlap(iocs, existingResults);
      default:
        return { score: 0 };
    }
  }

  /** TTP match: proportion of IOCs that share any template technique. */
  private evaluateTTPMatch(
    iocs: CorrelatedIOC[],
    requiredTechniques: string[],
  ): { score: number } {
    if (iocs.length === 0 || requiredTechniques.length === 0) return { score: 0 };
    const reqSet = new Set(requiredTechniques);
    let matching = 0;
    for (const ioc of iocs) {
      if (ioc.mitreAttack.some((t) => reqSet.has(t))) matching++;
    }
    return { score: Math.round((matching / iocs.length) * 1000) / 1000 };
  }

  /** Infra overlap: proportion of IOCs sharing ASN, CIDR, or registrar with at least one other. */
  private evaluateInfraOverlap(iocs: CorrelatedIOC[]): { score: number } {
    if (iocs.length < 2) return { score: 0 };
    const asnMap = new Map<string, number>();
    const cidrMap = new Map<string, number>();
    const regMap = new Map<string, number>();

    for (const ioc of iocs) {
      if (ioc.asn) asnMap.set(ioc.asn, (asnMap.get(ioc.asn) ?? 0) + 1);
      if (ioc.cidrPrefix) cidrMap.set(ioc.cidrPrefix, (cidrMap.get(ioc.cidrPrefix) ?? 0) + 1);
      if (ioc.registrar) regMap.set(ioc.registrar, (regMap.get(ioc.registrar) ?? 0) + 1);
    }

    let shared = 0;
    for (const ioc of iocs) {
      if ((ioc.asn && (asnMap.get(ioc.asn) ?? 0) > 1) ||
          (ioc.cidrPrefix && (cidrMap.get(ioc.cidrPrefix) ?? 0) > 1) ||
          (ioc.registrar && (regMap.get(ioc.registrar) ?? 0) > 1)) {
        shared++;
      }
    }
    return { score: Math.round((shared / iocs.length) * 1000) / 1000 };
  }

  /** Temporal proximity: how tightly clustered IOC first-seen times are. */
  private evaluateTemporalProximity(iocs: CorrelatedIOC[]): { score: number } {
    if (iocs.length < 2) return { score: 0 };
    const times = iocs.map((i) => new Date(i.firstSeen).getTime()).sort((a, b) => a - b);
    const span = times[times.length - 1]! - times[0]!;
    if (span <= 0) return { score: 1 };
    // Normalize: within 24h = 1.0, 7 days = ~0.14
    const hoursSpan = span / (3600 * 1000);
    const score = Math.max(0, 1 - hoursSpan / 168);
    return { score: Math.round(score * 1000) / 1000 };
  }

  /** Feed overlap: proportion of IOCs with 2+ source feeds OR existing correlation results. */
  private evaluateFeedOverlap(
    iocs: CorrelatedIOC[],
    existingResults: CorrelationResult[],
  ): { score: number } {
    if (iocs.length === 0) return { score: 0 };
    let multiSource = 0;
    for (const ioc of iocs) {
      if (ioc.sourceFeedIds.length >= 2) multiSource++;
    }
    const feedScore = multiSource / iocs.length;
    const corrBonus = Math.min(0.3, existingResults.length * 0.05);
    return { score: Math.round(Math.min(1, feedScore + corrBonus) * 1000) / 1000 };
  }

  /** Compute severity from matched condition count against thresholds. */
  private computeSeverity(
    matchedCount: number,
    thresholds: RuleTemplate['severityThresholds'],
  ): Severity {
    if (matchedCount >= thresholds.CRITICAL) return 'CRITICAL';
    if (matchedCount >= thresholds.HIGH) return 'HIGH';
    if (matchedCount >= thresholds.MEDIUM) return 'MEDIUM';
    if (matchedCount >= thresholds.LOW) return 'LOW';
    return 'INFO';
  }

  /** Collect IOC IDs that match any template technique. */
  private collectMatchedEntityIds(
    iocs: CorrelatedIOC[],
    techniques: string[],
  ): string[] {
    const reqSet = new Set(techniques);
    return iocs
      .filter((ioc) => ioc.mitreAttack.some((t) => reqSet.has(t)))
      .map((ioc) => ioc.id);
  }
}
