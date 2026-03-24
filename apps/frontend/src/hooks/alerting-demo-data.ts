/**
 * @module hooks/alerting-demo-data
 * @description Types and realistic demo data for Alerting Service (port 3023).
 * Used as fallback when alerting-service is unreachable.
 */

// ─── Helpers ────────────────────────────────────────────────────

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function hoursFromNow(n: number): string {
  return new Date(Date.now() + n * 3_600_000).toISOString()
}

// ─── Enums ──────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'suppressed' | 'escalated'
export type RuleConditionType = 'threshold' | 'pattern' | 'anomaly' | 'absence' | 'composite'
export type ChannelType = 'email' | 'slack' | 'webhook'

// ─── Interfaces ─────────────────────────────────────────────────

export interface AlertRule {
  id: string
  name: string
  description: string
  tenantId: string
  severity: AlertSeverity
  condition: { type: RuleConditionType; [key: string]: unknown }
  enabled: boolean
  channelIds: string[]
  escalationPolicyId: string | null
  cooldownMinutes: number
  tags: string[]
  lastTriggeredAt: string | null
  triggerCount: number
  createdAt: string
  updatedAt: string
}

export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  tenantId: string
  severity: AlertSeverity
  status: AlertStatus
  title: string
  description: string
  source: Record<string, unknown>
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  suppressedUntil: string | null
  suppressReason: string | null
  escalationLevel: number
  escalatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AlertHistoryEntry {
  id: string
  alertId: string
  action: string
  performedBy: string
  details: string
  createdAt: string
}

export interface NotificationChannel {
  id: string
  name: string
  tenantId: string
  type: ChannelType
  config: Record<string, unknown>
  enabled: boolean
  lastTestedAt: string | null
  lastTestSuccess: boolean | null
  createdAt: string
  updatedAt: string
}

export interface EscalationPolicy {
  id: string
  name: string
  tenantId: string
  steps: EscalationStep[]
  repeatAfterMinutes: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface EscalationStep {
  delayMinutes: number
  channelIds: string[]
  notifyMessage?: string
}

export interface AlertStats {
  total: number
  open: number
  acknowledged: number
  resolved: number
  suppressed: number
  escalated: number
  bySeverity: Record<AlertSeverity, number>
  avgResolutionMinutes: number
}

export interface AlertTemplate {
  id: string
  name: string
  description: string
  severity: AlertSeverity
  conditionType: RuleConditionType
  tags: string[]
}

// ─── Demo Data ──────────────────────────────────────────────────

export const DEMO_RULES: AlertRule[] = [
  {
    id: 'rule-001', name: 'Critical IOC Spike', description: 'Alert when critical IOCs exceed 50 in 1 hour',
    tenantId: 'demo', severity: 'critical',
    condition: { type: 'threshold', threshold: { metric: 'ioc.critical.count', operator: 'gt', value: 50, windowMinutes: 60 } },
    enabled: true, channelIds: ['ch-001', 'ch-002'], escalationPolicyId: 'esc-001',
    cooldownMinutes: 30, tags: ['ioc', 'critical'], lastTriggeredAt: hoursAgo(2), triggerCount: 14,
    createdAt: daysAgo(30), updatedAt: daysAgo(1),
  },
  {
    id: 'rule-002', name: 'Feed Ingestion Failure', description: 'Alert when no feed data received for 30 min',
    tenantId: 'demo', severity: 'high',
    condition: { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 30 } },
    enabled: true, channelIds: ['ch-001'], escalationPolicyId: null,
    cooldownMinutes: 15, tags: ['feed', 'availability'], lastTriggeredAt: daysAgo(3), triggerCount: 7,
    createdAt: daysAgo(45), updatedAt: daysAgo(10),
  },
  {
    id: 'rule-003', name: 'APT Actor Detection', description: 'Pattern match for known APT indicators',
    tenantId: 'demo', severity: 'critical',
    condition: { type: 'pattern', pattern: { eventType: 'ioc.created', field: 'tags', pattern: 'apt.*', minOccurrences: 3, windowMinutes: 120 } },
    enabled: true, channelIds: ['ch-001', 'ch-002', 'ch-003'], escalationPolicyId: 'esc-001',
    cooldownMinutes: 60, tags: ['apt', 'actor'], lastTriggeredAt: daysAgo(1), triggerCount: 3,
    createdAt: daysAgo(20), updatedAt: daysAgo(5),
  },
  {
    id: 'rule-004', name: 'Enrichment Anomaly', description: 'Detect anomalous enrichment failure rate',
    tenantId: 'demo', severity: 'medium',
    condition: { type: 'anomaly', anomaly: { metric: 'enrichment.failure_rate', deviationMultiplier: 3, baselineWindowHours: 24 } },
    enabled: false, channelIds: ['ch-001'], escalationPolicyId: null,
    cooldownMinutes: 120, tags: ['enrichment', 'anomaly'], lastTriggeredAt: null, triggerCount: 0,
    createdAt: daysAgo(15), updatedAt: daysAgo(15),
  },
  {
    id: 'rule-005', name: 'DRP Brand Alert', description: 'Alert on typosquatting domain detection',
    tenantId: 'demo', severity: 'high',
    condition: { type: 'threshold', threshold: { metric: 'drp.typosquat.detected', operator: 'gte', value: 1, windowMinutes: 60 } },
    enabled: true, channelIds: ['ch-002'], escalationPolicyId: null,
    cooldownMinutes: 60, tags: ['drp', 'brand'], lastTriggeredAt: hoursAgo(8), triggerCount: 11,
    createdAt: daysAgo(25), updatedAt: daysAgo(2),
  },
  {
    id: 'rule-006', name: 'Vulnerability Exploit Published', description: 'Alert when known-exploited CVEs appear',
    tenantId: 'demo', severity: 'high',
    condition: { type: 'pattern', pattern: { eventType: 'vuln.published', field: 'knownExploited', pattern: 'true', minOccurrences: 1, windowMinutes: 60 } },
    enabled: true, channelIds: ['ch-001', 'ch-003'], escalationPolicyId: 'esc-002',
    cooldownMinutes: 30, tags: ['vulnerability', 'exploit'], lastTriggeredAt: daysAgo(2), triggerCount: 9,
    createdAt: daysAgo(35), updatedAt: daysAgo(3),
  },
]

export const DEMO_ALERTS: Alert[] = [
  {
    id: 'alert-001', ruleId: 'rule-001', ruleName: 'Critical IOC Spike', tenantId: 'demo',
    severity: 'critical', status: 'open', title: '68 critical IOCs detected in last hour',
    description: 'Threshold exceeded: 68 critical IOCs ingested from US-CERT and AlienVault feeds.',
    source: { feedIds: ['us-cert', 'otx'], count: 68 },
    acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null,
    suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null,
    createdAt: hoursAgo(2), updatedAt: hoursAgo(2),
  },
  {
    id: 'alert-002', ruleId: 'rule-003', ruleName: 'APT Actor Detection', tenantId: 'demo',
    severity: 'critical', status: 'escalated', title: 'APT29 indicators detected — 5 IOCs linked',
    description: 'Pattern match: 5 IOCs tagged apt29 from multiple feeds in 2-hour window.',
    source: { actorName: 'APT29', iocCount: 5 },
    acknowledgedBy: 'analyst@demo.com', acknowledgedAt: hoursAgo(20),
    resolvedBy: null, resolvedAt: null, suppressedUntil: null, suppressReason: null,
    escalationLevel: 2, escalatedAt: hoursAgo(18), createdAt: daysAgo(1), updatedAt: hoursAgo(18),
  },
  {
    id: 'alert-003', ruleId: 'rule-005', ruleName: 'DRP Brand Alert', tenantId: 'demo',
    severity: 'high', status: 'acknowledged', title: 'Typosquatting domain: intelwatch.co detected',
    description: 'Typosquatting detection: intelwatch.co registered 4 hours ago, composite score 0.87.',
    source: { domain: 'intelwatch.co', score: 0.87 },
    acknowledgedBy: 'admin@demo.com', acknowledgedAt: hoursAgo(6),
    resolvedBy: null, resolvedAt: null, suppressedUntil: null, suppressReason: null,
    escalationLevel: 0, escalatedAt: null, createdAt: hoursAgo(8), updatedAt: hoursAgo(6),
  },
  {
    id: 'alert-004', ruleId: 'rule-002', ruleName: 'Feed Ingestion Failure', tenantId: 'demo',
    severity: 'high', status: 'resolved', title: 'No feed data for 45 minutes',
    description: 'Absence alert: feed.fetched event not received for 45 minutes.',
    source: { lastEvent: hoursAgo(48) },
    acknowledgedBy: 'ops@demo.com', acknowledgedAt: daysAgo(3),
    resolvedBy: 'ops@demo.com', resolvedAt: daysAgo(3), suppressedUntil: null, suppressReason: null,
    escalationLevel: 0, escalatedAt: null, createdAt: daysAgo(3), updatedAt: daysAgo(3),
  },
  {
    id: 'alert-005', ruleId: 'rule-006', ruleName: 'Vulnerability Exploit Published', tenantId: 'demo',
    severity: 'high', status: 'open', title: 'CVE-2026-1234 exploit published — EPSS 0.94',
    description: 'Known-exploited vulnerability published with EPSS score 0.94.',
    source: { cve: 'CVE-2026-1234', epss: 0.94 },
    acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null,
    suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null,
    createdAt: hoursAgo(4), updatedAt: hoursAgo(4),
  },
  {
    id: 'alert-006', ruleId: 'rule-001', ruleName: 'Critical IOC Spike', tenantId: 'demo',
    severity: 'critical', status: 'suppressed', title: '52 critical IOCs — suppressed (maintenance)',
    description: 'Threshold exceeded during scheduled maintenance window.',
    source: { count: 52 },
    acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null,
    suppressedUntil: hoursFromNow(4), suppressReason: 'Scheduled maintenance window',
    escalationLevel: 0, escalatedAt: null, createdAt: hoursAgo(1), updatedAt: hoursAgo(1),
  },
  {
    id: 'alert-007', ruleId: 'rule-003', ruleName: 'APT Actor Detection', tenantId: 'demo',
    severity: 'critical', status: 'resolved', title: 'APT28 indicators — 3 IOCs matched',
    description: 'Pattern match: 3 IOCs tagged apt28 resolved after investigation.',
    source: { actorName: 'APT28', iocCount: 3 },
    acknowledgedBy: 'analyst@demo.com', acknowledgedAt: daysAgo(5),
    resolvedBy: 'analyst@demo.com', resolvedAt: daysAgo(4),
    suppressedUntil: null, suppressReason: null, escalationLevel: 1, escalatedAt: daysAgo(5),
    createdAt: daysAgo(6), updatedAt: daysAgo(4),
  },
  {
    id: 'alert-008', ruleId: 'rule-005', ruleName: 'DRP Brand Alert', tenantId: 'demo',
    severity: 'medium', status: 'open', title: 'Suspicious domain: intelwatch-security.com',
    description: 'Typosquatting detection: intelwatch-security.com, composite score 0.62.',
    source: { domain: 'intelwatch-security.com', score: 0.62 },
    acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null,
    suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null,
    createdAt: hoursAgo(12), updatedAt: hoursAgo(12),
  },
]

export const DEMO_CHANNELS: NotificationChannel[] = [
  {
    id: 'ch-001', name: 'SOC Team Email', tenantId: 'demo', type: 'email',
    config: { type: 'email', email: { recipients: ['soc@acmecorp.com', 'analyst@acmecorp.com'] } },
    enabled: true, lastTestedAt: daysAgo(2), lastTestSuccess: true,
    createdAt: daysAgo(60), updatedAt: daysAgo(2),
  },
  {
    id: 'ch-002', name: '#alerts Slack Channel', tenantId: 'demo', type: 'slack',
    config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/services/T.../B.../xxx', channel: '#alerts' } },
    enabled: true, lastTestedAt: daysAgo(5), lastTestSuccess: true,
    createdAt: daysAgo(55), updatedAt: daysAgo(5),
  },
  {
    id: 'ch-003', name: 'SIEM Webhook', tenantId: 'demo', type: 'webhook',
    config: { type: 'webhook', webhook: { url: 'https://siem.acmecorp.com/api/alerts', method: 'POST', headers: { 'X-API-Key': '***' } } },
    enabled: true, lastTestedAt: daysAgo(1), lastTestSuccess: false,
    createdAt: daysAgo(40), updatedAt: daysAgo(1),
  },
  {
    id: 'ch-004', name: 'PagerDuty Integration', tenantId: 'demo', type: 'webhook',
    config: { type: 'webhook', webhook: { url: 'https://events.pagerduty.com/v2/enqueue', method: 'POST' } },
    enabled: false, lastTestedAt: null, lastTestSuccess: null,
    createdAt: daysAgo(10), updatedAt: daysAgo(10),
  },
]

export const DEMO_ESCALATIONS: EscalationPolicy[] = [
  {
    id: 'esc-001', name: 'Critical Alert Escalation', tenantId: 'demo',
    steps: [
      { delayMinutes: 0, channelIds: ['ch-001', 'ch-002'], notifyMessage: 'Critical alert triggered — immediate review required' },
      { delayMinutes: 15, channelIds: ['ch-002', 'ch-003'], notifyMessage: 'Unacknowledged critical alert — escalating to SIEM' },
      { delayMinutes: 30, channelIds: ['ch-001', 'ch-002', 'ch-003'], notifyMessage: 'URGENT: Critical alert unresolved for 30+ minutes' },
    ],
    repeatAfterMinutes: 60, enabled: true,
    createdAt: daysAgo(45), updatedAt: daysAgo(10),
  },
  {
    id: 'esc-002', name: 'High Severity — Business Hours', tenantId: 'demo',
    steps: [
      { delayMinutes: 0, channelIds: ['ch-001'], notifyMessage: 'High severity alert — review within 30 minutes' },
      { delayMinutes: 30, channelIds: ['ch-001', 'ch-002'], notifyMessage: 'Unacknowledged high alert — escalating to Slack' },
    ],
    repeatAfterMinutes: 0, enabled: true,
    createdAt: daysAgo(30), updatedAt: daysAgo(15),
  },
  {
    id: 'esc-003', name: 'After-Hours On-Call', tenantId: 'demo',
    steps: [
      { delayMinutes: 5, channelIds: ['ch-002'], notifyMessage: 'After-hours alert — on-call notified' },
      { delayMinutes: 20, channelIds: ['ch-002', 'ch-004'], notifyMessage: 'On-call unresponsive — paging backup' },
    ],
    repeatAfterMinutes: 30, enabled: false,
    createdAt: daysAgo(20), updatedAt: daysAgo(20),
  },
]

export const DEMO_STATS: AlertStats = {
  total: 247,
  open: 38,
  acknowledged: 15,
  resolved: 178,
  suppressed: 9,
  escalated: 7,
  bySeverity: { critical: 42, high: 89, medium: 76, low: 31, info: 9 },
  avgResolutionMinutes: 47,
}

export const DEMO_TEMPLATES: AlertTemplate[] = [
  { id: 'tpl-001', name: 'Critical IOC Threshold', description: 'Alert when critical IOC count exceeds threshold', severity: 'critical', conditionType: 'threshold', tags: ['ioc', 'critical'] },
  { id: 'tpl-002', name: 'Feed Health Monitor', description: 'Alert when feed ingestion stops', severity: 'high', conditionType: 'absence', tags: ['feed', 'health'] },
  { id: 'tpl-003', name: 'APT Pattern Detector', description: 'Detect patterns matching known APT groups', severity: 'critical', conditionType: 'pattern', tags: ['apt', 'detection'] },
  { id: 'tpl-004', name: 'Enrichment Rate Anomaly', description: 'Detect unusual enrichment failure spikes', severity: 'medium', conditionType: 'anomaly', tags: ['enrichment'] },
  { id: 'tpl-005', name: 'DRP Brand Monitor', description: 'Alert on new typosquatting domains', severity: 'high', conditionType: 'threshold', tags: ['drp', 'brand'] },
  { id: 'tpl-006', name: 'Exploit Published Alert', description: 'Alert when known-exploited CVEs appear', severity: 'high', conditionType: 'pattern', tags: ['vulnerability', 'exploit'] },
]

export const DEMO_HISTORY: AlertHistoryEntry[] = [
  { id: 'h-001', alertId: 'alert-002', action: 'created', performedBy: 'system', details: 'Alert triggered by rule APT Actor Detection', createdAt: daysAgo(1) },
  { id: 'h-002', alertId: 'alert-002', action: 'acknowledged', performedBy: 'analyst@demo.com', details: 'Acknowledged for investigation', createdAt: hoursAgo(20) },
  { id: 'h-003', alertId: 'alert-002', action: 'escalated', performedBy: 'system', details: 'Auto-escalated to level 2 after 2 hours unresolved', createdAt: hoursAgo(18) },
]
