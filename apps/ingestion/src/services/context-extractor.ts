/**
 * IOC Context Windowing — extracts surrounding sentence/paragraph for each IOC.
 * Captures WHY an IOC matters, not just the raw value.
 * Differentiator: most TI platforms extract bare IOC values. Context enables
 * better dedup, better analyst decisions, and better downstream AI enrichment.
 */

export interface IOCContext {
  iocValue: string;
  iocType: string;
  context: string;
  startOffset: number;
  endOffset: number;
}

export interface IOCInput {
  value: string;
  type: string;
}

const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=[A-Z0-9])/;
const DEFANG_MAP: [RegExp, string][] = [
  [/\[\.\]/g, '.'],
  [/\(\.\)/g, '.'],
  [/\[:\]/g, ':'],
  [/hxxps/gi, 'https'],
  [/hxxp/gi, 'http'],
];

function defangVariants(value: string): string[] {
  const variants = [value];
  let defanged = value;
  for (const [pattern, replacement] of DEFANG_MAP) {
    defanged = defanged.replace(pattern, replacement as string);
  }
  if (defanged !== value) variants.push(defanged);

  // Also produce the refanged → defanged direction
  let refanged = value.replace(/\./g, '[.]');
  if (refanged !== value) variants.push(refanged);

  return [...new Set(variants)];
}

export class ContextExtractor {
  private windowSize: number;

  constructor(windowSize: number = 1) {
    this.windowSize = windowSize;
  }

  extractSentences(text: string): string[] {
    return text
      .split(SENTENCE_SPLIT_RE)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  findContextWindow(sentences: string[], iocValue: string): { context: string; sentenceIdx: number } | null {
    const variants = defangVariants(iocValue);
    const lower = variants.map((v) => v.toLowerCase());

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i];
      if (!sent) continue;
      const sentLower = sent.toLowerCase();
      if (lower.some((v) => sentLower.includes(v))) {
        const start = Math.max(0, i - this.windowSize);
        const end = Math.min(sentences.length, i + this.windowSize + 1);
        const context = sentences.slice(start, end).join(' ');
        return { context, sentenceIdx: i };
      }
    }
    return null;
  }

  extractIOCContexts(content: string, iocs: IOCInput[]): IOCContext[] {
    const sentences = this.extractSentences(content);
    const results: IOCContext[] = [];

    for (const ioc of iocs) {
      const match = this.findContextWindow(sentences, ioc.value);
      if (match) {
        const startOffset = content.indexOf(match.context);
        results.push({
          iocValue: ioc.value,
          iocType: ioc.type,
          context: match.context,
          startOffset: startOffset >= 0 ? startOffset : 0,
          endOffset: startOffset >= 0 ? startOffset + match.context.length : match.context.length,
        });
      } else {
        // Fallback: return truncated content as context
        const truncated = content.slice(0, 200);
        results.push({
          iocValue: ioc.value,
          iocType: ioc.type,
          context: truncated,
          startOffset: 0,
          endOffset: truncated.length,
        });
      }
    }

    return results;
  }
}
