const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(previous|above|all)\s+instructions/gi, /you\s+are\s+now\s+(a|an|DAN)/gi,
  /system\s*:\s*/gi, /\[INST\]/gi, /<<SYS>>/gi, /<\|im_start\|>/gi,
  /\bdo\s+anything\s+now\b/gi, /\bact\s+as\s+(if|a)\b/gi,
  /\bpretend\s+(you|to)\b/gi, /\boverride\s+safety\b/gi,
];
const MAX_INPUT_CHARS = 50_000;

export interface SanitizeResult { sanitized: string; injectionDetected: boolean; matchedPatterns: string[]; }

export function sanitizeLLMInput(raw: string): SanitizeResult {
  const matchedPatterns: string[] = [];
  let sanitized = raw;
  for (const pattern of INJECTION_PATTERNS) {
    const freshPattern = new RegExp(pattern.source, pattern.flags);
    if (freshPattern.test(sanitized)) {
      matchedPatterns.push(pattern.source);
      sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags), '[FILTERED]');
    }
  }
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (sanitized.length > MAX_INPUT_CHARS) { sanitized = sanitized.slice(0, MAX_INPUT_CHARS) + '\n[TRUNCATED]'; }
  return { sanitized, injectionDetected: matchedPatterns.length > 0, matchedPatterns };
}
