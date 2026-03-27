import { describe, it, expect } from 'vitest';
import {
  stixConfidenceTier,
  stixConfidenceColor,
  formatConfidenceWithTier,
} from '../src/stix-confidence.js';

// ── stixConfidenceTier ──────────────────────────────────────────
describe('stixConfidenceTier', () => {
  it('0 → None', () => {
    expect(stixConfidenceTier(0)).toBe('None');
  });

  it('10 → Low', () => {
    expect(stixConfidenceTier(10)).toBe('Low');
  });

  it('20 → Low-Medium', () => {
    expect(stixConfidenceTier(20)).toBe('Low-Medium');
  });

  it('35 → Medium-Low', () => {
    expect(stixConfidenceTier(35)).toBe('Medium-Low');
  });

  it('50 → Medium', () => {
    expect(stixConfidenceTier(50)).toBe('Medium');
  });

  it('75 → High-Low', () => {
    expect(stixConfidenceTier(75)).toBe('High-Low');
  });

  it('90 → High', () => {
    expect(stixConfidenceTier(90)).toBe('High');
  });

  it('boundary: 1 → Low', () => {
    expect(stixConfidenceTier(1)).toBe('Low');
  });

  it('boundary: 14 → Low', () => {
    expect(stixConfidenceTier(14)).toBe('Low');
  });

  it('boundary: 15 → Low-Medium', () => {
    expect(stixConfidenceTier(15)).toBe('Low-Medium');
  });

  it('boundary: 29 → Low-Medium', () => {
    expect(stixConfidenceTier(29)).toBe('Low-Medium');
  });

  it('boundary: 30 → Medium-Low', () => {
    expect(stixConfidenceTier(30)).toBe('Medium-Low');
  });

  it('boundary: 44 → Medium-Low', () => {
    expect(stixConfidenceTier(44)).toBe('Medium-Low');
  });

  it('boundary: 45 → Medium', () => {
    expect(stixConfidenceTier(45)).toBe('Medium');
  });

  it('boundary: 69 → Medium', () => {
    expect(stixConfidenceTier(69)).toBe('Medium');
  });

  it('boundary: 70 → High-Low', () => {
    expect(stixConfidenceTier(70)).toBe('High-Low');
  });

  it('boundary: 84 → High-Low', () => {
    expect(stixConfidenceTier(84)).toBe('High-Low');
  });

  it('boundary: 85 → High', () => {
    expect(stixConfidenceTier(85)).toBe('High');
  });

  it('boundary: 100 → High', () => {
    expect(stixConfidenceTier(100)).toBe('High');
  });

  it('negative → None', () => {
    expect(stixConfidenceTier(-5)).toBe('None');
  });

  it('>100 → High', () => {
    expect(stixConfidenceTier(150)).toBe('High');
  });
});

// ── stixConfidenceColor ─────────────────────────────────────────
describe('stixConfidenceColor', () => {
  it('None (0) → red', () => {
    expect(stixConfidenceColor(0)).toBe('red');
  });

  it('Low (10) → red', () => {
    expect(stixConfidenceColor(10)).toBe('red');
  });

  it('Low-Medium (20) → red', () => {
    expect(stixConfidenceColor(20)).toBe('red');
  });

  it('Medium-Low (35) → amber', () => {
    expect(stixConfidenceColor(35)).toBe('amber');
  });

  it('Medium (50) → amber', () => {
    expect(stixConfidenceColor(50)).toBe('amber');
  });

  it('High-Low (75) → green', () => {
    expect(stixConfidenceColor(75)).toBe('green');
  });

  it('High (90) → green', () => {
    expect(stixConfidenceColor(90)).toBe('green');
  });
});

// ── formatConfidenceWithTier ────────────────────────────────────
describe('formatConfidenceWithTier', () => {
  it('72 → "72 (High-Low)"', () => {
    expect(formatConfidenceWithTier(72)).toBe('72 (High-Low)');
  });

  it('0 → "0 (None)"', () => {
    expect(formatConfidenceWithTier(0)).toBe('0 (None)');
  });

  it('50 → "50 (Medium)"', () => {
    expect(formatConfidenceWithTier(50)).toBe('50 (Medium)');
  });

  it('100 → "100 (High)"', () => {
    expect(formatConfidenceWithTier(100)).toBe('100 (High)');
  });
});
