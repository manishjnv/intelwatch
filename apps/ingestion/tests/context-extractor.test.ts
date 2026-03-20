import { describe, it, expect } from 'vitest';
import { ContextExtractor } from '../src/services/context-extractor.js';

const extractor = new ContextExtractor(1);

describe('ContextExtractor.extractSentences', () => {
  it('splits text on sentence boundaries', () => {
    const text = 'The actor deployed Cobalt Strike. Targets included finance sector. Investigation is ongoing.';
    const sentences = extractor.extractSentences(text);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toContain('Cobalt Strike');
  });

  it('handles single sentence', () => {
    expect(extractor.extractSentences('Single sentence here.')).toHaveLength(1);
  });

  it('handles empty text', () => {
    expect(extractor.extractSentences('')).toHaveLength(0);
  });
});

describe('ContextExtractor.findContextWindow', () => {
  const sentences = [
    'APT29 was first observed in 2015.',
    'The IP 192.168.1.1 was used as C2 infrastructure.',
    'Further analysis revealed lateral movement.',
    'The campaign targeted energy sector.',
  ];

  it('finds sentence containing IOC with surrounding context', () => {
    const result = extractor.findContextWindow(sentences, '192.168.1.1');
    expect(result).not.toBeNull();
    expect(result!.context).toContain('192.168.1.1');
    expect(result!.context).toContain('APT29'); // window includes previous sentence
    expect(result!.sentenceIdx).toBe(1);
  });

  it('returns null for IOC not in text', () => {
    expect(extractor.findContextWindow(sentences, '10.0.0.1')).toBeNull();
  });

  it('matches defanged IOC variants', () => {
    const defangedSentences = ['The IP 192[.]168[.]1[.]1 was used.'];
    const result = extractor.findContextWindow(defangedSentences, '192.168.1.1');
    expect(result).not.toBeNull();
  });
});

describe('ContextExtractor.extractIOCContexts', () => {
  const content = 'APT28 campaign detected. The domain evil.com served as C2 server. Hash abc123 was found in payloads. Investigation continues.';

  it('extracts context for multiple IOCs', () => {
    const iocs = [
      { value: 'evil.com', type: 'domain' },
      { value: 'abc123', type: 'hash_md5' },
    ];
    const results = extractor.extractIOCContexts(content, iocs);

    expect(results).toHaveLength(2);
    expect(results[0].iocValue).toBe('evil.com');
    expect(results[0].context).toContain('evil.com');
    expect(results[1].iocValue).toBe('abc123');
  });

  it('provides fallback context for IOC not found in text', () => {
    const iocs = [{ value: 'notfound.xyz', type: 'domain' }];
    const results = extractor.extractIOCContexts(content, iocs);

    expect(results).toHaveLength(1);
    expect(results[0].context.length).toBeLessThanOrEqual(200);
  });

  it('returns start/end offsets', () => {
    const iocs = [{ value: 'evil.com', type: 'domain' }];
    const results = extractor.extractIOCContexts(content, iocs);

    expect(results[0].startOffset).toBeGreaterThanOrEqual(0);
    expect(results[0].endOffset).toBeGreaterThan(results[0].startOffset);
  });
});
