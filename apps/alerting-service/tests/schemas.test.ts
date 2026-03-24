import { describe, it, expect } from 'vitest';
import {
  CreateRuleSchema,
  UpdateRuleSchema,
  ListRulesQuerySchema,
  ListAlertsQuerySchema,
  SuppressAlertSchema,
  BulkAlertIdsSchema,
  CreateChannelSchema,
  UpdateChannelSchema,
  ListChannelsQuerySchema,
  CreateEscalationSchema,
  UpdateEscalationSchema,
  ListEscalationsQuerySchema,
  RuleConditionSchema,
} from '../src/schemas/alert.js';

describe('Alert schemas', () => {
  // ─── Rule Condition ────────────────────────────────────────────────

  describe('RuleConditionSchema', () => {
    it('accepts threshold condition', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'threshold',
        threshold: { metric: 'critical_iocs', operator: 'gt', value: 10, windowMinutes: 60 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts pattern condition', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'pattern',
        pattern: { eventType: 'ioc.created', field: 'actorName', pattern: 'APT.*', minOccurrences: 3 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts anomaly condition', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'anomaly',
        anomaly: { metric: 'ioc_ingestion_rate', deviationMultiplier: 3 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts absence condition', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'absence',
        absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts composite AND condition', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'composite',
        composite: {
          operator: 'and',
          conditions: [
            { type: 'threshold', threshold: { metric: 'm', operator: 'gt', value: 5 } },
            { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 60 } },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts composite OR condition', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'composite',
        composite: {
          operator: 'or',
          conditions: [
            { type: 'threshold', threshold: { metric: 'm', operator: 'gt', value: 5 } },
            { type: 'pattern', pattern: { eventType: 'ioc.created', field: 'f', pattern: '.*', minOccurrences: 1 } },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects composite with fewer than 2 conditions', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'composite',
        composite: {
          operator: 'and',
          conditions: [
            { type: 'threshold', threshold: { metric: 'm', operator: 'gt', value: 5 } },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects composite with invalid operator', () => {
      const result = RuleConditionSchema.safeParse({
        type: 'composite',
        composite: {
          operator: 'xor',
          conditions: [
            { type: 'threshold', threshold: { metric: 'm', operator: 'gt', value: 5 } },
            { type: 'absence', absence: { eventType: 'e', expectedIntervalMinutes: 60 } },
          ],
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid rule type', () => {
      const result = RuleConditionSchema.safeParse({ type: 'invalid', threshold: {} });
      expect(result.success).toBe(false);
    });

    it('rejects missing threshold field for threshold type', () => {
      const result = RuleConditionSchema.safeParse({ type: 'threshold' });
      expect(result.success).toBe(false);
    });
  });

  // ─── CreateRuleSchema ──────────────────────────────────────────────

  describe('CreateRuleSchema', () => {
    const validRule = {
      name: 'High IOC rate',
      severity: 'critical',
      condition: {
        type: 'threshold' as const,
        threshold: { metric: 'critical_iocs', operator: 'gt' as const, value: 10 },
      },
    };

    it('accepts valid rule with defaults', () => {
      const result = CreateRuleSchema.safeParse(validRule);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantId).toBe('default');
        expect(result.data.enabled).toBe(true);
        expect(result.data.cooldownMinutes).toBe(15);
      }
    });

    it('rejects empty name', () => {
      const result = CreateRuleSchema.safeParse({ ...validRule, name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid severity', () => {
      const result = CreateRuleSchema.safeParse({ ...validRule, severity: 'extreme' });
      expect(result.success).toBe(false);
    });

    it('accepts optional tags', () => {
      const result = CreateRuleSchema.safeParse({ ...validRule, tags: ['network', 'apt'] });
      expect(result.success).toBe(true);
    });

    it('rejects too many tags', () => {
      const result = CreateRuleSchema.safeParse({
        ...validRule,
        tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── UpdateRuleSchema ──────────────────────────────────────────────

  describe('UpdateRuleSchema', () => {
    it('accepts partial update', () => {
      const result = UpdateRuleSchema.safeParse({ name: 'Updated name' });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = UpdateRuleSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // ─── ListRulesQuerySchema ──────────────────────────────────────────

  describe('ListRulesQuerySchema', () => {
    it('applies defaults', () => {
      const result = ListRulesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantId).toBe('default');
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('parses enabled from string', () => {
      const result = ListRulesQuerySchema.safeParse({ enabled: 'true' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.enabled).toBe(true);
    });

    it('accepts type filter', () => {
      const result = ListRulesQuerySchema.safeParse({ type: 'threshold' });
      expect(result.success).toBe(true);
    });
  });

  // ─── ListAlertsQuerySchema ─────────────────────────────────────────

  describe('ListAlertsQuerySchema', () => {
    it('applies defaults', () => {
      const result = ListAlertsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('accepts severity and status filters', () => {
      const result = ListAlertsQuerySchema.safeParse({ severity: 'high', status: 'open' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = ListAlertsQuerySchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  // ─── SuppressAlertSchema ───────────────────────────────────────────

  describe('SuppressAlertSchema', () => {
    it('accepts valid duration', () => {
      const result = SuppressAlertSchema.safeParse({ durationMinutes: 30 });
      expect(result.success).toBe(true);
    });

    it('defaults to 60 minutes', () => {
      const result = SuppressAlertSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.durationMinutes).toBe(60);
    });

    it('rejects duration over 10080', () => {
      const result = SuppressAlertSchema.safeParse({ durationMinutes: 20000 });
      expect(result.success).toBe(false);
    });
  });

  // ─── BulkAlertIdsSchema ────────────────────────────────────────────

  describe('BulkAlertIdsSchema', () => {
    it('accepts valid UUIDs', () => {
      const result = BulkAlertIdsSchema.safeParse({
        ids: ['00000000-0000-0000-0000-000000000001'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty array', () => {
      const result = BulkAlertIdsSchema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID strings', () => {
      const result = BulkAlertIdsSchema.safeParse({ ids: ['not-a-uuid'] });
      expect(result.success).toBe(false);
    });
  });

  // ─── Channel Schemas ──────────────────────────────────────────────

  describe('CreateChannelSchema', () => {
    it('accepts email channel', () => {
      const result = CreateChannelSchema.safeParse({
        name: 'SOC Email',
        config: { type: 'email', email: { recipients: ['soc@example.com'] } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts slack channel', () => {
      const result = CreateChannelSchema.safeParse({
        name: 'SOC Slack',
        config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/test' } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts webhook channel', () => {
      const result = CreateChannelSchema.safeParse({
        name: 'Webhook',
        config: { type: 'webhook', webhook: { url: 'https://api.example.com/alerts' } },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = CreateChannelSchema.safeParse({
        name: 'Bad Email',
        config: { type: 'email', email: { recipients: ['not-an-email'] } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid webhook URL', () => {
      const result = CreateChannelSchema.safeParse({
        name: 'Bad Webhook',
        config: { type: 'webhook', webhook: { url: 'not-a-url' } },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateChannelSchema', () => {
    it('accepts partial update', () => {
      const result = UpdateChannelSchema.safeParse({ name: 'Renamed' });
      expect(result.success).toBe(true);
    });
  });

  describe('ListChannelsQuerySchema', () => {
    it('applies defaults', () => {
      const result = ListChannelsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.page).toBe(1);
    });

    it('accepts type filter', () => {
      const result = ListChannelsQuerySchema.safeParse({ type: 'email' });
      expect(result.success).toBe(true);
    });
  });

  // ─── Escalation Schemas ───────────────────────────────────────────

  describe('CreateEscalationSchema', () => {
    it('accepts valid policy', () => {
      const result = CreateEscalationSchema.safeParse({
        name: 'P1 Escalation',
        steps: [{ delayMinutes: 15, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty steps', () => {
      const result = CreateEscalationSchema.safeParse({ name: 'Bad', steps: [] });
      expect(result.success).toBe(false);
    });

    it('rejects step with empty channelIds', () => {
      const result = CreateEscalationSchema.safeParse({
        name: 'Bad',
        steps: [{ delayMinutes: 5, channelIds: [] }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateEscalationSchema', () => {
    it('accepts partial update', () => {
      const result = UpdateEscalationSchema.safeParse({ name: 'Renamed' });
      expect(result.success).toBe(true);
    });
  });

  describe('ListEscalationsQuerySchema', () => {
    it('applies defaults', () => {
      const result = ListEscalationsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.page).toBe(1);
    });
  });
});
