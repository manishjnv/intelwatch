import type { AlertRule } from './rule-store.js';
import type { RuleCondition } from '../schemas/alert.js';
import { getLogger } from '../logger.js';

export interface EvaluationEvent {
  tenantId: string;
  eventType: string;
  metric?: string;
  value?: number;
  field?: string;
  fieldValue?: string;
  timestamp: string;
  source?: Record<string, unknown>;
}

export interface EvaluationResult {
  triggered: boolean;
  ruleId: string;
  ruleName: string;
  reason: string;
}

/**
 * In-memory metric/event buffer for rule evaluation.
 * Stores recent events per tenant to evaluate threshold, pattern, anomaly, and absence rules.
 */
export class RuleEngine {
  /** Recent events buffer: tenantId -> events (kept for max window) */
  private eventBuffer = new Map<string, EvaluationEvent[]>();
  private readonly maxBufferPerTenant: number;
  private readonly maxBufferAgeMs: number;

  constructor(maxBufferPerTenant: number = 10000, maxBufferAgeHours: number = 168) {
    this.maxBufferPerTenant = maxBufferPerTenant;
    this.maxBufferAgeMs = maxBufferAgeHours * 3600_000;
  }

  /** Push a new event into the buffer. */
  pushEvent(event: EvaluationEvent): void {
    const tenantId = event.tenantId;
    let buffer = this.eventBuffer.get(tenantId);
    if (!buffer) {
      buffer = [];
      this.eventBuffer.set(tenantId, buffer);
    }

    buffer.push(event);

    // Trim old events beyond max age
    const cutoff = Date.now() - this.maxBufferAgeMs;
    while (buffer.length > 0 && new Date(buffer[0]!.timestamp).getTime() < cutoff) {
      buffer.shift();
    }

    // Trim by count
    if (buffer.length > this.maxBufferPerTenant) {
      buffer.splice(0, buffer.length - this.maxBufferPerTenant);
    }
  }

  /** Evaluate a single rule against current buffered events. */
  evaluate(rule: AlertRule): EvaluationResult {
    const base = { ruleId: rule.id, ruleName: rule.name };

    try {
      const cond = rule.condition;
      switch (cond.type) {
        case 'threshold':
          return this.evaluateThreshold(rule, cond);
        case 'pattern':
          return this.evaluatePattern(rule, cond);
        case 'anomaly':
          return this.evaluateAnomaly(rule, cond);
        case 'absence':
          return this.evaluateAbsence(rule, cond);
        case 'composite':
          return this.evaluateComposite(rule, cond);
        default:
          return { ...base, triggered: false, reason: 'Unknown rule type' };
      }
    } catch (err) {
      getLogger().error({ ruleId: rule.id, err }, 'Rule evaluation error');
      return { ...base, triggered: false, reason: `Evaluation error: ${(err as Error).message}` };
    }
  }

  /** Threshold: trigger when metric count/sum exceeds value within window. */
  private evaluateThreshold(
    rule: AlertRule,
    cond: Extract<RuleCondition, { type: 'threshold' }>,
  ): EvaluationResult {
    const base = { ruleId: rule.id, ruleName: rule.name };
    const { metric, operator, value, windowMinutes } = cond.threshold;
    const events = this.getEventsInWindow(rule.tenantId, windowMinutes);
    const metricEvents = events.filter((e) => e.metric === metric);
    const currentValue = metricEvents.reduce((sum, e) => sum + (e.value ?? 0), 0);

    const triggered = this.compareValues(currentValue, operator, value);
    const reason = triggered
      ? `Metric '${metric}' value ${currentValue} ${operator} ${value} in last ${windowMinutes}m`
      : `Metric '${metric}' value ${currentValue} does not meet threshold ${operator} ${value}`;

    return { ...base, triggered, reason };
  }

  /** Pattern: trigger when event pattern matches N+ times within window. */
  private evaluatePattern(
    rule: AlertRule,
    cond: Extract<RuleCondition, { type: 'pattern' }>,
  ): EvaluationResult {
    const base = { ruleId: rule.id, ruleName: rule.name };
    const { eventType, field, pattern, minOccurrences, windowMinutes } = cond.pattern;
    const events = this.getEventsInWindow(rule.tenantId, windowMinutes);
    const regex = new RegExp(pattern, 'i');

    const matches = events.filter((e) => {
      if (e.eventType !== eventType) return false;
      const fieldVal = e.field === field ? e.fieldValue : undefined;
      return fieldVal !== undefined && regex.test(fieldVal);
    });

    const triggered = matches.length >= minOccurrences;
    const reason = triggered
      ? `Pattern '${pattern}' on ${field} matched ${matches.length} times (min: ${minOccurrences}) in last ${windowMinutes}m`
      : `Pattern '${pattern}' on ${field} matched ${matches.length}/${minOccurrences} in last ${windowMinutes}m`;

    return { ...base, triggered, reason };
  }

  /** Anomaly: trigger when current rate deviates N× from baseline. */
  private evaluateAnomaly(
    rule: AlertRule,
    cond: Extract<RuleCondition, { type: 'anomaly' }>,
  ): EvaluationResult {
    const base = { ruleId: rule.id, ruleName: rule.name };
    const { metric, deviationMultiplier, baselineWindowHours } = cond.anomaly;
    const allEvents = this.getEventsInWindow(rule.tenantId, baselineWindowHours * 60);
    const metricEvents = allEvents.filter((e) => e.metric === metric);

    if (metricEvents.length < 2) {
      return { ...base, triggered: false, reason: `Insufficient data for anomaly detection on '${metric}'` };
    }

    // Compute hourly rate baseline
    const values = metricEvents.map((e) => e.value ?? 0);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Current hour rate
    const recentEvents = this.getEventsInWindow(rule.tenantId, 60);
    const currentValue = recentEvents.filter((e) => e.metric === metric).reduce((s, e) => s + (e.value ?? 0), 0);

    const threshold = mean + deviationMultiplier * stdDev;
    const triggered = stdDev > 0 && currentValue > threshold;
    const reason = triggered
      ? `Anomaly: '${metric}' current=${currentValue} exceeds ${deviationMultiplier}× baseline (mean=${mean.toFixed(1)}, std=${stdDev.toFixed(1)})`
      : `No anomaly: '${metric}' current=${currentValue} within ${deviationMultiplier}× baseline`;

    return { ...base, triggered, reason };
  }

  /** Absence: trigger when no event of type occurs within expected interval. */
  private evaluateAbsence(
    rule: AlertRule,
    cond: Extract<RuleCondition, { type: 'absence' }>,
  ): EvaluationResult {
    const base = { ruleId: rule.id, ruleName: rule.name };
    const { eventType, expectedIntervalMinutes } = cond.absence;
    const events = this.getEventsInWindow(rule.tenantId, expectedIntervalMinutes);
    const matching = events.filter((e) => e.eventType === eventType);

    const triggered = matching.length === 0;
    const reason = triggered
      ? `Absence: no '${eventType}' events in last ${expectedIntervalMinutes}m`
      : `'${eventType}' received ${matching.length} events in last ${expectedIntervalMinutes}m`;

    return { ...base, triggered, reason };
  }

  /** Composite: evaluate AND/OR of multiple sub-conditions. */
  private evaluateComposite(
    rule: AlertRule,
    cond: Extract<RuleCondition, { type: 'composite' }>,
  ): EvaluationResult {
    const base = { ruleId: rule.id, ruleName: rule.name };
    const { operator, conditions } = cond.composite;

    const subResults = conditions.map((sub) => {
      // Create a temporary rule with the sub-condition
      const tempRule: AlertRule = { ...rule, condition: sub as RuleCondition };
      return this.evaluate(tempRule);
    });

    const triggered = operator === 'and'
      ? subResults.every((r) => r.triggered)
      : subResults.some((r) => r.triggered);

    const triggeredReasons = subResults.filter((r) => r.triggered).map((r) => r.reason);
    const allReasons = subResults.map((r) => `[${r.triggered ? '✓' : '✗'}] ${r.reason}`);
    const reason = triggered
      ? `Composite (${operator.toUpperCase()}): ${triggeredReasons.join(' + ')}`
      : `Composite (${operator.toUpperCase()}) not met: ${allReasons.join('; ')}`;

    return { ...base, triggered, reason };
  }

  /** Get events within a time window for a tenant. */
  private getEventsInWindow(tenantId: string, windowMinutes: number): EvaluationEvent[] {
    const buffer = this.eventBuffer.get(tenantId);
    if (!buffer) return [];
    const cutoff = Date.now() - windowMinutes * 60_000;
    return buffer.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  }

  /** Compare two numbers with an operator. */
  private compareValues(current: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return current > threshold;
      case 'gte': return current >= threshold;
      case 'lt': return current < threshold;
      case 'lte': return current <= threshold;
      case 'eq': return current === threshold;
      default: return false;
    }
  }

  /** Get buffer size for a tenant (for monitoring). */
  getBufferSize(tenantId: string): number {
    return this.eventBuffer.get(tenantId)?.length ?? 0;
  }

  /** Clear all buffers (for testing). */
  clear(): void {
    this.eventBuffer.clear();
  }
}
