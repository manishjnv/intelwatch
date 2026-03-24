import type { CreateRuleDto } from '../schemas/alert.js';

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  rule: Omit<CreateRuleDto, 'tenantId'>;
}

/** 6 built-in rule templates for fast onboarding. */
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'tpl-high-ioc-rate',
    name: 'High Critical IOC Rate',
    description: 'Triggers when more than 10 critical IOCs are ingested per hour. Indicates a potential active campaign.',
    category: 'ingestion',
    rule: {
      name: 'High Critical IOC Rate',
      severity: 'critical',
      condition: {
        type: 'threshold',
        threshold: { metric: 'critical_iocs', operator: 'gt', value: 10, windowMinutes: 60 },
      },
      enabled: true,
      cooldownMinutes: 30,
      tags: ['ioc', 'ingestion', 'volume'],
    },
  },
  {
    id: 'tpl-feed-absence',
    name: 'Feed Data Absence',
    description: 'Triggers when no feed data is received for 2 hours. May indicate feed source failure or network issue.',
    category: 'ingestion',
    rule: {
      name: 'Feed Data Absence',
      severity: 'high',
      condition: {
        type: 'absence',
        absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 },
      },
      enabled: true,
      cooldownMinutes: 60,
      tags: ['feed', 'availability'],
    },
  },
  {
    id: 'tpl-apt-pattern',
    name: 'APT Actor Pattern',
    description: 'Triggers when 3+ IOCs linked to APT groups are detected within an hour. Suggests targeted attack.',
    category: 'threat-actor',
    rule: {
      name: 'APT Actor Pattern',
      severity: 'critical',
      condition: {
        type: 'pattern',
        pattern: {
          eventType: 'ioc.created',
          field: 'actorName',
          pattern: 'APT.*',
          minOccurrences: 3,
          windowMinutes: 60,
        },
      },
      enabled: true,
      cooldownMinutes: 30,
      tags: ['apt', 'threat-actor', 'targeted'],
    },
  },
  {
    id: 'tpl-anomaly-spike',
    name: 'IOC Ingestion Anomaly',
    description: 'Triggers when IOC ingestion rate exceeds 3x the 24-hour baseline. Detects unusual activity spikes.',
    category: 'anomaly',
    rule: {
      name: 'IOC Ingestion Anomaly',
      severity: 'high',
      condition: {
        type: 'anomaly',
        anomaly: { metric: 'ioc_ingestion_rate', deviationMultiplier: 3, baselineWindowHours: 24 },
      },
      enabled: true,
      cooldownMinutes: 60,
      tags: ['anomaly', 'ingestion', 'spike'],
    },
  },
  {
    id: 'tpl-critical-cve',
    name: 'Critical CVE Published',
    description: 'Triggers when critical-severity CVEs are detected above threshold. Requires immediate patching review.',
    category: 'vulnerability',
    rule: {
      name: 'Critical CVE Published',
      severity: 'critical',
      condition: {
        type: 'threshold',
        threshold: { metric: 'critical_cves', operator: 'gte', value: 1, windowMinutes: 60 },
      },
      enabled: true,
      cooldownMinutes: 15,
      tags: ['cve', 'vulnerability', 'patching'],
    },
  },
  {
    id: 'tpl-drp-alert',
    name: 'Digital Risk Detection',
    description: 'Triggers when typosquat, dark web, or credential leak detections occur. Brand protection alert.',
    category: 'drp',
    rule: {
      name: 'Digital Risk Detection',
      severity: 'high',
      condition: {
        type: 'threshold',
        threshold: { metric: 'drp_detections', operator: 'gte', value: 1, windowMinutes: 30 },
      },
      enabled: true,
      cooldownMinutes: 15,
      tags: ['drp', 'brand-protection', 'typosquat'],
    },
  },
];

/** Get all available rule templates. */
export function getTemplates(): RuleTemplate[] {
  return RULE_TEMPLATES;
}

/** Get a template by ID. */
export function getTemplateById(id: string): RuleTemplate | undefined {
  return RULE_TEMPLATES.find((t) => t.id === id);
}

/** Get templates by category. */
export function getTemplatesByCategory(category: string): RuleTemplate[] {
  return RULE_TEMPLATES.filter((t) => t.category === category);
}
