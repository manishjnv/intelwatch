import { describe, it, expect } from 'vitest';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';

describe('DRP Service — P0#1 Confidence Scorer', () => {
  const scorer = new ConfidenceScorer();

  // P1.1 empty signals returns 0 confidence
  it('P1.1 empty signals returns 0 confidence', () => {
    const result = scorer.score([]);
    expect(result.confidence).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  // P1.2 single signal returns weighted score
  it('P1.2 single signal returns weighted score', () => {
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.8, description: 'High severity breach' },
    ]);
    // weight for breach_severity = 0.30, value = 0.8
    // confidence = (0.30 * 0.8) / 0.30 = 0.8
    expect(result.confidence).toBe(0.8);
    expect(result.reasons.length).toBe(1);
  });

  // P1.3 multiple signals produce weighted average
  it('P1.3 multiple signals produce weighted average', () => {
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 1.0, description: 'Critical' },
      { signalType: 'exposed_count', rawValue: 0.5, description: '500k accounts' },
    ]);
    // breach_severity weight=0.30, exposed_count weight=0.25
    // weighted sum = 0.30*1.0 + 0.25*0.5 = 0.30 + 0.125 = 0.425
    // total weight = 0.30 + 0.25 = 0.55
    // confidence = 0.425 / 0.55 ≈ 0.7727...
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reasons.length).toBe(2);

    // Verify it's a weighted average, not a simple average
    const expected = Math.round((0.30 * 1.0 + 0.25 * 0.5) / (0.30 + 0.25) * 1000) / 1000;
    expect(result.confidence).toBe(expected);
  });

  // P1.4 confidence is clamped to 0-1
  it('P1.4 confidence is clamped to 0-1', () => {
    // Even with very high values, confidence stays <= 1
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 1.0, description: 'Max' },
      { signalType: 'exposed_count', rawValue: 1.0, description: 'Max' },
      { signalType: 'password_included', rawValue: 1.0, description: 'Max' },
      { signalType: 'breach_recency', rawValue: 1.0, description: 'Max' },
    ]);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);

    // With zero values
    const zeroResult = scorer.score([
      { signalType: 'breach_severity', rawValue: 0, description: 'None' },
    ]);
    expect(zeroResult.confidence).toBeGreaterThanOrEqual(0);
  });

  // P1.5 reasons are populated for each signal
  it('P1.5 reasons are populated for each signal', () => {
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.9, description: 'Critical breach' },
      { signalType: 'exposed_count', rawValue: 0.5, description: '500k exposed' },
    ]);
    expect(result.reasons.length).toBe(2);

    for (const reason of result.reasons) {
      expect(reason.signal).toBeDefined();
      expect(typeof reason.weight).toBe('number');
      expect(typeof reason.value).toBe('number');
      expect(typeof reason.description).toBe('string');
      expect(reason.description.length).toBeGreaterThan(0);
    }
  });

  // P1.6 reasons sorted by contribution descending
  it('P1.6 reasons sorted by contribution descending', () => {
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.2, description: 'Low' },     // 0.30*0.2 = 0.06
      { signalType: 'password_included', rawValue: 0.9, description: 'High' },  // 0.35*0.9 = 0.315
      { signalType: 'exposed_count', rawValue: 0.5, description: 'Mid' },       // 0.25*0.5 = 0.125
    ]);

    expect(result.reasons.length).toBe(3);
    // First reason should have highest contribution
    for (let i = 0; i < result.reasons.length - 1; i++) {
      const curr = result.reasons[i]!;
      const next = result.reasons[i + 1]!;
      expect(curr.weight * curr.value).toBeGreaterThanOrEqual(next.weight * next.value);
    }
  });

  // P1.7 known signal types have correct weights
  it('P1.7 known signal types have correct weights', () => {
    expect(scorer.getSignalWeight('breach_severity')).toBe(0.30);
    expect(scorer.getSignalWeight('exposed_count')).toBe(0.25);
    expect(scorer.getSignalWeight('password_included')).toBe(0.35);
    expect(scorer.getSignalWeight('breach_recency')).toBe(0.20);
    expect(scorer.getSignalWeight('service_risk')).toBe(0.30);
    expect(scorer.getSignalWeight('credential_dump')).toBe(0.40);
    expect(scorer.getSignalWeight('homoglyph_similarity')).toBe(0.25);
  });

  // P1.8 unknown signal types get default weight
  it('P1.8 unknown signal types get default weight', () => {
    const weight = scorer.getSignalWeight('totally_made_up_signal');
    expect(weight).toBe(0.15);
  });

  // P1.9 raw values are clamped 0-1
  it('P1.9 raw values are clamped 0-1', () => {
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 5.0, description: 'Over max' },
    ]);
    // Value should be clamped to 1.0 internally
    expect(result.reasons[0]!.value).toBe(1);
    expect(result.confidence).toBeLessThanOrEqual(1);

    const negResult = scorer.score([
      { signalType: 'breach_severity', rawValue: -2.0, description: 'Under min' },
    ]);
    expect(negResult.reasons[0]!.value).toBe(0);
    expect(negResult.confidence).toBeGreaterThanOrEqual(0);
  });

  // P1.10 description contains signal type
  it('P1.10 description contains signal type (underscores replaced with spaces)', () => {
    const result = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.7, description: 'Test breach' },
    ]);
    const desc = result.reasons[0]!.description;
    // Signal type with underscores replaced by spaces
    expect(desc).toContain('breach severity');
  });

  // P1.11 description contains strength label (strong/moderate/weak)
  it('P1.11 description contains strength label', () => {
    const strong = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.9, description: 'High' },
    ]);
    expect(strong.reasons[0]!.description).toContain('strong');

    const moderate = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.6, description: 'Mid' },
    ]);
    expect(moderate.reasons[0]!.description).toContain('moderate');

    const weak = scorer.score([
      { signalType: 'breach_severity', rawValue: 0.3, description: 'Low' },
    ]);
    expect(weak.reasons[0]!.description).toContain('weak');
  });

  // P1.12 high-value signals produce strong description
  it('P1.12 high-value signals produce strong description', () => {
    const result = scorer.score([
      { signalType: 'password_included', rawValue: 0.95, description: 'Plaintext passwords' },
    ]);
    expect(result.reasons[0]!.description).toMatch(/strong/);
    expect(result.reasons[0]!.description).toContain('95%');
  });

  // P1.13 low-value signals produce weak description
  it('P1.13 low-value signals produce weak description', () => {
    const result = scorer.score([
      { signalType: 'exposed_count', rawValue: 0.1, description: 'Small leak' },
    ]);
    expect(result.reasons[0]!.description).toMatch(/weak/);
    expect(result.reasons[0]!.description).toContain('10%');
  });

  // P1.14 getSignalWeight returns correct weight for known types
  it('P1.14 getSignalWeight returns correct weight for all known signal categories', () => {
    // Typosquatting signals
    expect(scorer.getSignalWeight('homoglyph_similarity')).toBe(0.25);
    expect(scorer.getSignalWeight('tld_variant_match')).toBe(0.20);
    expect(scorer.getSignalWeight('domain_registered')).toBe(0.30);
    expect(scorer.getSignalWeight('recent_registration')).toBe(0.25);

    // Dark web signals
    expect(scorer.getSignalWeight('keyword_density')).toBe(0.25);
    expect(scorer.getSignalWeight('source_reputation')).toBe(0.30);
    expect(scorer.getSignalWeight('data_for_sale')).toBe(0.35);

    // Attack surface signals
    expect(scorer.getSignalWeight('version_outdated')).toBe(0.20);
    expect(scorer.getSignalWeight('cert_expired')).toBe(0.25);
    expect(scorer.getSignalWeight('high_risk_port')).toBe(0.25);
  });
});
