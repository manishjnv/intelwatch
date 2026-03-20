/**
 * Confidence Calibrator — Calibrated probability bands for triage.
 *
 * Most TIPs output binary relevant/not-relevant or uncalibrated confidence scores.
 * A "0.85 confidence" should mean "85% of articles scored 0.85 are actually CTI-relevant."
 *
 * This module tracks precision/recall per confidence band (deciles: 0.0-0.1, 0.1-0.2, ...),
 * then provides calibration adjustments so downstream consumers can trust the scores.
 *
 * Per-tenant calibration: each tenant's analyst feedback shapes their own calibration curve.
 */

export interface CalibrationBand {
  rangeMin: number; // e.g., 0.8
  rangeMax: number; // e.g., 0.9
  totalPredictions: number;
  truePositives: number;
  falsePositives: number;
  precision: number; // TP / (TP + FP), NaN if no data
  calibrationOffset: number; // How far off: precision - midpoint (negative = overconfident)
}

export interface CalibrationResult {
  rawConfidence: number;
  calibratedConfidence: number;
  band: CalibrationBand;
  isCalibrated: boolean; // false if band has < MIN_SAMPLES
}

export interface CalibrationSummary {
  tenantId: string;
  bands: CalibrationBand[];
  totalSamples: number;
  overallPrecision: number;
  calibrationError: number; // Mean absolute calibration error across bands
  isReliable: boolean; // true if total samples >= MIN_TOTAL_SAMPLES
}

const NUM_BANDS = 10; // Deciles: 0.0-0.1, 0.1-0.2, ..., 0.9-1.0
const MIN_SAMPLES_PER_BAND = 10;
const MIN_TOTAL_SAMPLES = 50;

interface BandAccumulator {
  totalPredictions: number;
  truePositives: number;
  falsePositives: number;
}

export class ConfidenceCalibrator {
  // tenantId → array of 10 band accumulators
  private readonly tenantBands = new Map<string, BandAccumulator[]>();

  /**
   * Record a triage outcome for calibration.
   * @param tenantId - Tenant context
   * @param predictedConfidence - Raw model confidence (0-1)
   * @param wasActuallyRelevant - Ground truth from analyst feedback
   */
  recordOutcome(tenantId: string, predictedConfidence: number, wasActuallyRelevant: boolean): void {
    const bands = this.getOrCreateBands(tenantId);
    const bandIdx = confidenceToBandIndex(predictedConfidence);
    const band = bands[bandIdx]!;

    band.totalPredictions++;
    if (wasActuallyRelevant) {
      band.truePositives++;
    } else {
      band.falsePositives++;
    }
  }

  /**
   * Calibrate a raw confidence score using historical data.
   * If enough data exists for the band, adjusts toward observed precision.
   */
  calibrate(tenantId: string, rawConfidence: number): CalibrationResult {
    const bands = this.tenantBands.get(tenantId);
    const bandIdx = confidenceToBandIndex(rawConfidence);

    if (!bands) {
      return {
        rawConfidence,
        calibratedConfidence: rawConfidence,
        band: emptyBand(bandIdx),
        isCalibrated: false,
      };
    }

    const acc = bands[bandIdx]!;
    const band = accumulatorToBand(bandIdx, acc);

    if (acc.totalPredictions < MIN_SAMPLES_PER_BAND) {
      return { rawConfidence, calibratedConfidence: rawConfidence, band, isCalibrated: false };
    }

    const blendWeight = Math.min(0.8, acc.totalPredictions / 100);
    const calibrated = rawConfidence * (1 - blendWeight) + band.precision * blendWeight;

    return {
      rawConfidence,
      calibratedConfidence: clamp(calibrated),
      band,
      isCalibrated: true,
    };
  }

  /**
   * Get full calibration summary for a tenant.
   */
  getSummary(tenantId: string): CalibrationSummary {
    const bands = this.tenantBands.get(tenantId);

    if (!bands) {
      return {
        tenantId,
        bands: Array.from({ length: NUM_BANDS }, (_, i) => emptyBand(i)),
        totalSamples: 0,
        overallPrecision: 0,
        calibrationError: 0,
        isReliable: false,
      };
    }

    const bandResults = bands.map((acc, idx) => accumulatorToBand(idx, acc!));
    const totalSamples = bands.reduce((sum, b) => sum + b.totalPredictions, 0);
    const totalTP = bands.reduce((sum, b) => sum + b.truePositives, 0);
    const totalFP = bands.reduce((sum, b) => sum + b.falsePositives, 0);
    const overallPrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;

    // Mean absolute calibration error: avg |precision - midpoint| across populated bands
    let calErrorSum = 0;
    let populatedBands = 0;
    for (const band of bandResults) {
      if (band.totalPredictions >= MIN_SAMPLES_PER_BAND) {
        calErrorSum += Math.abs(band.calibrationOffset);
        populatedBands++;
      }
    }

    return {
      tenantId,
      bands: bandResults,
      totalSamples,
      overallPrecision: round(overallPrecision),
      calibrationError: populatedBands > 0 ? round(calErrorSum / populatedBands) : 0,
      isReliable: totalSamples >= MIN_TOTAL_SAMPLES,
    };
  }

  clear(): void {
    this.tenantBands.clear();
  }

  private getOrCreateBands(tenantId: string): BandAccumulator[] {
    let bands = this.tenantBands.get(tenantId);
    if (!bands) {
      bands = Array.from({ length: NUM_BANDS }, () => ({
        totalPredictions: 0,
        truePositives: 0,
        falsePositives: 0,
      }));
      this.tenantBands.set(tenantId, bands);
    }
    return bands;
  }
}

function confidenceToBandIndex(confidence: number): number {
  const idx = Math.floor(confidence * NUM_BANDS);
  return Math.max(0, Math.min(NUM_BANDS - 1, idx));
}

function accumulatorToBand(idx: number, acc: BandAccumulator): CalibrationBand {
  const rangeMin = idx / NUM_BANDS;
  const rangeMax = (idx + 1) / NUM_BANDS;
  const midpoint = (rangeMin + rangeMax) / 2;
  const precision = acc.totalPredictions > 0
    ? acc.truePositives / acc.totalPredictions
    : 0;

  return {
    rangeMin,
    rangeMax,
    totalPredictions: acc.totalPredictions,
    truePositives: acc.truePositives,
    falsePositives: acc.falsePositives,
    precision: round(precision),
    calibrationOffset: round(precision - midpoint),
  };
}

function emptyBand(idx: number): CalibrationBand {
  return accumulatorToBand(idx, { totalPredictions: 0, truePositives: 0, falsePositives: 0 });
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

function round(val: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}
