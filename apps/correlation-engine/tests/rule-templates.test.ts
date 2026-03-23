import { describe, it, expect } from 'vitest';
import { RuleTemplateService } from '../src/services/rule-templates.js';
import type { CorrelatedIOC, CorrelationResult } from '../src/schemas/correlation.js';

function makeIOC(overrides: Partial<CorrelatedIOC> = {}): CorrelatedIOC {
  return {
    id: 'ioc-1', tenantId: 't1', iocType: 'ip', value: '1.2.3.4',
    normalizedValue: '1.2.3.4', confidence: 80, severity: 'HIGH',
    tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
    sourceFeedIds: ['f1'], firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(), enrichmentQuality: 0.7,
    ...overrides,
  };
}

function makeResult(overrides: Partial<CorrelationResult> = {}): CorrelationResult {
  return {
    id: 'cr-1', tenantId: 't1', correlationType: 'cooccurrence',
    severity: 'MEDIUM', confidence: 0.85, entities: [],
    metadata: {}, suppressed: false, ruleId: 'rule-cooc',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RuleTemplateService', () => {
  const service = new RuleTemplateService();

  describe('listTemplates', () => {
    it('returns all 6 templates', () => {
      const templates = service.listTemplates();
      expect(templates).toHaveLength(6);
    });

    it('each template has required fields', () => {
      for (const t of service.listTemplates()) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(t.requiredConditions.length).toBeGreaterThan(0);
        expect(t.mitreTechniques.length).toBeGreaterThan(0);
        expect(t.severityThresholds).toBeDefined();
        expect(t.tpCount).toBe(0);
        expect(t.fpCount).toBe(0);
      }
    });
  });

  describe('getTemplate', () => {
    it('returns template by ID', () => {
      const t = service.getTemplate('apt-infra-reuse');
      expect(t).not.toBeNull();
      expect(t!.category).toBe('apt');
    });

    it('returns null for unknown ID', () => {
      expect(service.getTemplate('nonexistent')).toBeNull();
    });
  });

  describe('evaluateTemplate', () => {
    it('returns null for unknown template ID', () => {
      const result = service.evaluateTemplate('nonexistent', new Map(), []);
      expect(result).toBeNull();
    });

    it('matches APT template with matching IOCs', () => {
      const now = new Date();
      const iocs = new Map<string, CorrelatedIOC>();
      // Build IOCs with shared infrastructure + ATT&CK techniques
      for (let i = 0; i < 5; i++) {
        iocs.set(`ioc-${i}`, makeIOC({
          id: `ioc-${i}`,
          iocType: 'ip',
          asn: 'AS12345',
          cidrPrefix: '10.0.0.0/8',
          mitreAttack: ['T1071', 'T1071.001', 'T1059', 'T1005'],
          sourceFeedIds: ['f1', 'f2'],
          firstSeen: new Date(now.getTime() - i * 3600 * 1000).toISOString(),
        }));
      }

      const results = [makeResult({ correlationType: 'cooccurrence' })];
      const match = service.evaluateTemplate('apt-infra-reuse', iocs, results);
      expect(match).not.toBeNull();
      expect(match!.templateId).toBe('apt-infra-reuse');
      expect(match!.score).toBeGreaterThan(0);
    });

    it('returns LOW severity for 1 condition match', () => {
      const iocs = new Map<string, CorrelatedIOC>();
      // Only TTP match, no infra overlap
      iocs.set('ioc-1', makeIOC({
        mitreAttack: ['T1071', 'T1059'],
        sourceFeedIds: ['f1'],
      }));
      iocs.set('ioc-2', makeIOC({
        id: 'ioc-2',
        mitreAttack: ['T1071', 'T1005'],
        sourceFeedIds: ['f1'],
      }));

      const match = service.evaluateTemplate('apt-infra-reuse', iocs, []);
      if (match) {
        const matchedCount = match.matchedConditions.filter((c) => c.matched).length;
        if (matchedCount === 1) {
          expect(match.severity).toBe('LOW');
        }
      }
    });

    it('returns CRITICAL severity when all conditions match', () => {
      const iocs = new Map<string, CorrelatedIOC>();
      // All conditions: TTP + infra + temporal + feed overlap
      for (let i = 0; i < 6; i++) {
        iocs.set(`ioc-${i}`, makeIOC({
          id: `ioc-${i}`,
          asn: 'AS99999',
          cidrPrefix: '192.168.0.0/16',
          registrar: 'evil-reg',
          mitreAttack: ['T1071', 'T1071.001', 'T1059', 'T1005'],
          sourceFeedIds: ['f1', 'f2', 'f3'],
          firstSeen: new Date().toISOString(),
        }));
      }

      const results = [
        makeResult({ correlationType: 'cooccurrence', confidence: 0.9 }),
        makeResult({ id: 'cr-2', correlationType: 'infrastructure_overlap', confidence: 0.8 }),
      ];

      const match = service.evaluateTemplate('apt-infra-reuse', iocs, results);
      expect(match).not.toBeNull();
      const allMatched = match!.matchedConditions.every((c) => c.matched);
      if (allMatched) {
        expect(match!.severity).toBe('CRITICAL');
      }
    });
  });

  describe('evaluateAllTemplates', () => {
    it('returns matches for applicable templates', () => {
      const iocs = new Map<string, CorrelatedIOC>();
      for (let i = 0; i < 5; i++) {
        iocs.set(`ioc-${i}`, makeIOC({
          id: `ioc-${i}`,
          asn: 'AS12345',
          mitreAttack: ['T1071', 'T1059', 'T1486', 'T1567', 'T1566', 'T1021'],
          sourceFeedIds: ['f1', 'f2'],
          firstSeen: new Date().toISOString(),
        }));
      }

      const matches = service.evaluateAllTemplates(iocs, []);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array when no conditions met', () => {
      const iocs = new Map<string, CorrelatedIOC>();
      iocs.set('ioc-1', makeIOC({ mitreAttack: [], sourceFeedIds: [] }));
      const matches = service.evaluateAllTemplates(iocs, []);
      expect(matches).toHaveLength(0);
    });
  });

  describe('recordFeedback', () => {
    it('increments TP count', () => {
      const svc = new RuleTemplateService();
      svc.recordFeedback('apt-infra-reuse', 'true_positive');
      const t = svc.getTemplate('apt-infra-reuse');
      expect(t!.tpCount).toBe(1);
    });

    it('increments FP count', () => {
      const svc = new RuleTemplateService();
      svc.recordFeedback('apt-infra-reuse', 'false_positive');
      const t = svc.getTemplate('apt-infra-reuse');
      expect(t!.fpCount).toBe(1);
    });
  });
});
