import { randomUUID } from 'crypto';

export type AlertMetric = 'cpu' | 'memory' | 'disk' | 'queue_lag' | 'error_rate' | 'response_time_p95';
export type AlertOperator = 'gt' | 'lt' | 'gte' | 'lte';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  operator: AlertOperator;
  severity: AlertSeverity;
  enabled: boolean;
  notifyChannels: string[];
  cooldownMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRuleInput {
  name: string;
  metric: AlertMetric;
  threshold: number;
  operator: AlertOperator;
  severity: AlertSeverity;
  notifyChannels: string[];
  cooldownMs?: number;
  enabled?: boolean;
}

export interface UpdateAlertRuleInput {
  name?: string;
  threshold?: number;
  severity?: AlertSeverity;
  enabled?: boolean;
  notifyChannels?: string[];
  cooldownMs?: number;
}

export interface MetricSnapshot {
  cpu: number;
  memory: number;
  disk: number;
  queueLag: number;
  errorRate: number;
  responseTimeP95?: number;
}

export interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  metric: AlertMetric;
  threshold: number;
  currentValue: number;
  severity: AlertSeverity;
  timestamp: string;
}

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/** In-memory alert rules store with default rules pre-loaded (DECISION-013, P0 #7). */
export class AlertRulesStore {
  private _rules: Map<string, AlertRule> = new Map();

  constructor() {
    this._seedDefaults();
  }

  /** Create a new alert rule. */
  create(input: CreateAlertRuleInput): AlertRule {
    const now = new Date().toISOString();
    const rule: AlertRule = {
      id: randomUUID(),
      name: input.name,
      metric: input.metric,
      threshold: input.threshold,
      operator: input.operator,
      severity: input.severity,
      enabled: input.enabled ?? true,
      notifyChannels: input.notifyChannels,
      cooldownMs: input.cooldownMs ?? DEFAULT_COOLDOWN_MS,
      createdAt: now,
      updatedAt: now,
    };
    this._rules.set(rule.id, rule);
    return rule;
  }

  /** List all rules. */
  list(): AlertRule[] {
    return Array.from(this._rules.values());
  }

  /** Get a rule by id. */
  getById(id: string): AlertRule | undefined {
    return this._rules.get(id);
  }

  /** Update a rule. Returns undefined if not found. */
  update(id: string, input: UpdateAlertRuleInput): AlertRule | undefined {
    const rule = this._rules.get(id);
    if (!rule) return undefined;
    const updated: AlertRule = { ...rule, ...input, updatedAt: new Date().toISOString() };
    this._rules.set(id, updated);
    return updated;
  }

  /** Delete a rule. Returns false if not found. */
  delete(id: string): boolean {
    return this._rules.delete(id);
  }

  /** Evaluate all enabled rules against a metric snapshot. Returns triggered alerts. */
  evaluate(metrics: MetricSnapshot): TriggeredAlert[] {
    const metricMap: Record<AlertMetric, number> = {
      cpu: metrics.cpu,
      memory: metrics.memory,
      disk: metrics.disk,
      queue_lag: metrics.queueLag,
      error_rate: metrics.errorRate,
      response_time_p95: metrics.responseTimeP95 ?? 0,
    };

    const triggered: TriggeredAlert[] = [];
    for (const rule of this._rules.values()) {
      if (!rule.enabled) continue;
      const current = metricMap[rule.metric];
      if (this._check(current, rule.operator, rule.threshold)) {
        triggered.push({
          ruleId: rule.id,
          ruleName: rule.name,
          metric: rule.metric,
          threshold: rule.threshold,
          currentValue: current,
          severity: rule.severity,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return triggered;
  }

  private _check(value: number, operator: AlertOperator, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
    }
  }

  private _seedDefaults(): void {
    const defaults: CreateAlertRuleInput[] = [
      { name: 'High CPU', metric: 'cpu', threshold: 90, operator: 'gt', severity: 'critical', notifyChannels: ['email'] },
      { name: 'High Memory', metric: 'memory', threshold: 90, operator: 'gt', severity: 'critical', notifyChannels: ['email'] },
      { name: 'High Disk', metric: 'disk', threshold: 85, operator: 'gt', severity: 'warning', notifyChannels: ['email'] },
      { name: 'Queue Backlog', metric: 'queue_lag', threshold: 5000, operator: 'gt', severity: 'warning', notifyChannels: [] },
      { name: 'High Error Rate', metric: 'error_rate', threshold: 0.05, operator: 'gt', severity: 'critical', notifyChannels: ['email'] },
    ];
    for (const d of defaults) this.create(d);
  }
}
