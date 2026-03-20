import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceCalibrator } from '../src/services/confidence-calibrator.js';

const TENANT = 'tenant-1';

describe('ConfidenceCalibrator', () => {
  let cal: ConfidenceCalibrator;

  beforeEach(() => {
    cal = new ConfidenceCalibrator();
  });

  describe('recordOutcome + calibrate', () => {
    it('returns uncalibrated result when no data exists', () => {
      const result = cal.calibrate(TENANT, 0.85);
      expect(result.isCalibrated).toBe(false);
      expect(result.calibratedConfidence).toBe(0.85);
    });

    it('returns uncalibrated when band has insufficient samples', () => {
      // Add 5 samples (below MIN_SAMPLES_PER_BAND of 10)
      for (let i = 0; i < 5; i++) {
        cal.recordOutcome(TENANT, 0.85, true);
      }

      const result = cal.calibrate(TENANT, 0.85);
      expect(result.isCalibrated).toBe(false);
    });

    it('calibrates overconfident predictions downward', () => {
      // Model predicts 0.85 but only 50% are actually relevant → overconfident
      for (let i = 0; i < 20; i++) {
        cal.recordOutcome(TENANT, 0.85, i < 10); // 10 TP, 10 FP
      }

      const result = cal.calibrate(TENANT, 0.85);
      expect(result.isCalibrated).toBe(true);
      expect(result.calibratedConfidence).toBeLessThan(0.85); // Adjusted down
      expect(result.calibratedConfidence).toBeGreaterThan(0.4); // Not zero
    });

    it('calibrates underconfident predictions upward', () => {
      // Model predicts 0.35 but 90% are actually relevant → underconfident
      for (let i = 0; i < 20; i++) {
        cal.recordOutcome(TENANT, 0.35, i < 18); // 18 TP, 2 FP
      }

      const result = cal.calibrate(TENANT, 0.35);
      expect(result.isCalibrated).toBe(true);
      expect(result.calibratedConfidence).toBeGreaterThan(0.35);
    });

    it('leaves well-calibrated predictions unchanged', () => {
      // Model predicts 0.85 and 85% are relevant → well calibrated
      for (let i = 0; i < 20; i++) {
        cal.recordOutcome(TENANT, 0.85, i < 17); // 17/20 = 85%
      }

      const result = cal.calibrate(TENANT, 0.85);
      expect(result.isCalibrated).toBe(true);
      // Should be close to original since calibration matches
      expect(Math.abs(result.calibratedConfidence - 0.85)).toBeLessThan(0.05);
    });

    it('clamps calibrated value to 0-1', () => {
      for (let i = 0; i < 20; i++) {
        cal.recordOutcome(TENANT, 0.95, true);
      }

      const result = cal.calibrate(TENANT, 0.99);
      expect(result.calibratedConfidence).toBeLessThanOrEqual(1);
      expect(result.calibratedConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSummary', () => {
    it('returns empty summary for unknown tenant', () => {
      const summary = cal.getSummary('unknown');
      expect(summary.totalSamples).toBe(0);
      expect(summary.isReliable).toBe(false);
      expect(summary.bands).toHaveLength(10);
    });

    it('computes overall precision correctly', () => {
      // 30 TP, 10 FP across different bands
      for (let i = 0; i < 30; i++) cal.recordOutcome(TENANT, 0.85, true);
      for (let i = 0; i < 10; i++) cal.recordOutcome(TENANT, 0.85, false);

      const summary = cal.getSummary(TENANT);
      expect(summary.overallPrecision).toBe(0.75); // 30/40
      expect(summary.totalSamples).toBe(40);
    });

    it('marks summary reliable when >= 50 total samples', () => {
      for (let i = 0; i < 50; i++) {
        cal.recordOutcome(TENANT, 0.5 + Math.random() * 0.4, i % 3 !== 0);
      }

      const summary = cal.getSummary(TENANT);
      expect(summary.isReliable).toBe(true);
      expect(summary.totalSamples).toBe(50);
    });

    it('marks summary unreliable when < 50 samples', () => {
      for (let i = 0; i < 20; i++) {
        cal.recordOutcome(TENANT, 0.85, true);
      }

      const summary = cal.getSummary(TENANT);
      expect(summary.isReliable).toBe(false);
    });

    it('computes calibration error across bands', () => {
      // Fill band 8 (0.8-0.9) with 50% precision → offset = 0.5 - 0.85 = -0.35
      for (let i = 0; i < 20; i++) {
        cal.recordOutcome(TENANT, 0.85, i < 10);
      }

      const summary = cal.getSummary(TENANT);
      const band8 = summary.bands[8];
      expect(band8.totalPredictions).toBe(20);
      expect(band8.precision).toBe(0.5);
      expect(band8.calibrationOffset).toBeLessThan(0); // Overconfident
    });
  });

  describe('per-tenant isolation', () => {
    it('keeps calibration data separate per tenant', () => {
      for (let i = 0; i < 15; i++) cal.recordOutcome('tenant-a', 0.85, true);
      for (let i = 0; i < 15; i++) cal.recordOutcome('tenant-b', 0.85, false);

      const resultA = cal.calibrate('tenant-a', 0.85);
      const resultB = cal.calibrate('tenant-b', 0.85);

      expect(resultA.isCalibrated).toBe(true);
      expect(resultB.isCalibrated).toBe(true);
      expect(resultA.calibratedConfidence).toBeGreaterThan(resultB.calibratedConfidence);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      for (let i = 0; i < 15; i++) cal.recordOutcome(TENANT, 0.85, true);
      cal.clear();
      const result = cal.calibrate(TENANT, 0.85);
      expect(result.isCalibrated).toBe(false);
    });
  });
});
