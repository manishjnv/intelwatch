/**
 * @module @etip/shared-normalization
 * @description IOC type detection, value normalization, and confidence scoring.
 *
 * @example
 * ```typescript
 * import { detectIOCType, normalizeIOCValue, calculateCompositeConfidence } from '@etip/shared-normalization';
 *
 * const type = detectIOCType('192[.]168[.]1[.]1'); // 'ip'
 * const normalized = normalizeIOCValue('192[.]168[.]1[.]1', type); // '192.168.1.1'
 * ```
 */

export { detectIOCType, type IOCType } from './ioc-detect.js';
export { normalizeIOCValue } from './normalize.js';
export {
  CONFIDENCE_WEIGHTS,
  ConfidenceSignalSchema,
  type ConfidenceSignal,
  type CompositeConfidence,
  calculateCompositeConfidence,
} from './confidence.js';
