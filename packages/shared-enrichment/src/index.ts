/**
 * @module @etip/shared-enrichment
 * @description LLM output validation and input sanitization for ETIP.
 *
 * @example
 * ```typescript
 * import { validateLLMOutput, sanitizeLLMInput, EnrichmentOutputSchema } from '@etip/shared-enrichment';
 * ```
 */

export {
  EnrichmentOutputSchema,
  type EnrichmentOutput,
  validateLLMOutput,
} from './output-validator.js';

export {
  sanitizeLLMInput,
  type SanitizeResult,
} from './llm-sanitizer.js';
