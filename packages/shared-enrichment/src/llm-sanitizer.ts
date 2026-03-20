/**
 * @module @etip/shared-enrichment/llm-sanitizer
 * @description Sanitize text before sending to any LLM API.
 * Threat feeds contain adversary-crafted content — treat every
 * external string as hostile.
 *
 * @see SKILL_SECURITY.md §14
 */

/** Patterns that can manipulate LLM behavior. */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(previous|above|all)\s+instructions/gi,
  /you\s+are\s+now\s+(a|an|DAN)/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /<<SYS>>/gi,
  /<\|im_start\|>/gi,
  /\bdo\s+anything\s+now\b/gi,
  /\bact\s+as\s+(if|a)\b/gi,
  /\bpretend\s+(you|to)\b/gi,
  /\boverride\s+safety\b/gi,
];

/** Maximum input characters to prevent token exhaustion attacks. */
const MAX_INPUT_CHARS = 50_000;

export interface SanitizeResult {
  /** Sanitized text safe for LLM consumption. */
  sanitized: string;
  /** Whether any injection patterns were detected. */
  injectionDetected: boolean;
  /** Source regex patterns that matched (for logging). */
  matchedPatterns: string[];
}

/**
 * Sanitize text before sending to any LLM API.
 * Call this on ALL external inputs: feed article bodies, IOC descriptions,
 * user-submitted queries, report text, dark web scraped content.
 *
 * @param raw - Raw text input (potentially hostile)
 * @returns Sanitization result with cleaned text and detection flags
 */
export function sanitizeLLMInput(raw: string): SanitizeResult {
  const matchedPatterns: string[] = [];
  let sanitized = raw;

  for (const pattern of INJECTION_PATTERNS) {
    // Reset lastIndex for global regexes
    const freshPattern = new RegExp(pattern.source, pattern.flags);
    if (freshPattern.test(sanitized)) {
      matchedPatterns.push(pattern.source);
      sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags), '[FILTERED]');
    }
  }

  // Strip control characters (U+0000–U+001F except \n \r \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Truncate to max LLM context budget
  if (sanitized.length > MAX_INPUT_CHARS) {
    sanitized = sanitized.slice(0, MAX_INPUT_CHARS) + '\n[TRUNCATED]';
  }

  return {
    sanitized,
    injectionDetected: matchedPatterns.length > 0,
    matchedPatterns,
  };
}
