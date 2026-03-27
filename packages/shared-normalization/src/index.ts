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
  IOC_DECAY_RATES,
  DEFAULT_DECAY_RATE,
  ConfidenceSignalSchema,
  type ConfidenceSignal,
  type ConfidenceSignalInput,
  type CompositeConfidence,
  calculateCompositeConfidence,
} from './confidence.js';

// ── NATO Admiralty Code ──────────────────────────────────────────
export {
  admiraltyToScore,
  scoreToAdmiralty,
  formatAdmiraltyCode,
  ADMIRALTY_LABELS,
  type SourceReliability,
  type InfoCredibility,
} from './admiralty.js';

// ── Bayesian Confidence Model ────────────────────────────────────
export {
  toLogOdds,
  fromLogOdds,
  calculateBayesianConfidence,
  selectConfidenceModel,
  BAYESIAN_WEIGHTS,
  type BayesianConfidenceInput,
  type ConfidenceCalculator,
} from './bayesian-confidence.js';

// ── STIX 2.1 Confidence Tiers ───────────────────────────────────
export {
  stixConfidenceTier,
  stixConfidenceColor,
  formatConfidenceWithTier,
  type StixConfidenceTier,
} from './stix-confidence.js';

// ── CPE 2.3 Parser ──────────────────────────────────────────────
export {
  parseCPE,
  formatCPE,
  matchCPE,
  isValidCPE,
  type CPEComponents,
} from './cpe.js';

// ── MISP Warninglist Matcher ────────────────────────────────────
export {
  WarninglistMatcher,
  isIpInCidr,
  type WarninglistEntry,
  type WarninglistMatch,
} from './warninglist.js';

// ── ATT&CK Technique Weighting ─────────────────────────────────
export {
  getAttackWeight,
  calculateAttackSeverity,
  getAttackTacticSeverity,
  listAttackTechniques,
  type AttackTechniqueWeight,
} from './attack-weighting.js';

// ── Fuzzy Deduplication ──────────────────────────────────────────
export {
  computeFuzzyHash,
  areFuzzyDuplicates,
  normalizeIocValue as fuzzyNormalizeIocValue,
  stripDefang,
  stripPort,
  normalizeUrl as fuzzyNormalizeUrl,
} from './fuzzy-dedupe.js';

// ── Velocity Score ───────────────────────────────────────────────
export {
  calculateVelocityScore,
  isVelocitySpike,
  decayVelocityScore,
  type VelocityInput,
  type VelocityResult,
} from './velocity-score.js';

// ── Cross-Feed Corroboration ────────────────────────────────────
export {
  calculateCorroborationScore,
  calculateIndependenceScore,
  getConsensusFromSources,
  type CorroborationSource,
  type CorroborationResult,
} from './corroboration.js';

// ── CWE Chain Mapper ─────────────────────────────────────────────
export {
  getCweEntry,
  getCweSeverity,
  getCwesByCategoryMap,
  buildCweChain,
  type CweEntry,
} from './cwe-chain.js';
