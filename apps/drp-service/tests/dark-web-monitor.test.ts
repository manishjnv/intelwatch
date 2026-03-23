import { describe, it, expect, beforeEach } from 'vitest';
import { DarkWebMonitor } from '../src/services/dark-web-monitor.js';
import { DRPStore } from '../src/schemas/store.js';

describe('DRP Service — #4 Dark Web Monitor', () => {
  let store: DRPStore;
  let monitor: DarkWebMonitor;

  beforeEach(() => {
    store = new DRPStore();
    monitor = new DarkWebMonitor(store);
  });

  // 4.1 scan returns mentions for matching keywords
  it('4.1 scan returns mentions for matching keywords', () => {
    // Run multiple times to overcome randomness in shouldMatch
    let totalMentions = 0;
    for (let i = 0; i < 20; i++) {
      const mentions = monitor.scan('tenant-1', ['acmecorp'], [
        'paste_site', 'forum', 'marketplace', 'telegram', 'irc',
      ]);
      totalMentions += mentions.length;
    }
    // With all sources and 20 attempts, statistically should get at least 1 mention
    expect(totalMentions).toBeGreaterThan(0);
  });

  // 4.2 scan filters by source type
  it('4.2 scan filters by source type', () => {
    let forumMentions = 0;
    for (let i = 0; i < 30; i++) {
      const mentions = monitor.scan('tenant-1', ['acmecorp'], ['forum']);
      for (const m of mentions) {
        expect(m.source).toBe('forum');
      }
      forumMentions += mentions.length;
    }
    // With 30 attempts on forum source, should get some results
    expect(forumMentions).toBeGreaterThan(0);
  });

  // 4.3 mentions have required fields
  it('4.3 mentions have required fields', () => {
    // Run until we get at least one mention
    let mentions: ReturnType<DarkWebMonitor['scan']> = [];
    for (let i = 0; i < 50 && mentions.length === 0; i++) {
      mentions = monitor.scan('tenant-1', ['acmecorp'], [
        'paste_site', 'forum', 'marketplace', 'telegram', 'irc',
      ]);
    }
    expect(mentions.length).toBeGreaterThan(0);

    for (const m of mentions) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('source');
      expect(m).toHaveProperty('content');
      expect(m).toHaveProperty('matchedKeywords');
      expect(m).toHaveProperty('url');
      expect(m).toHaveProperty('severity');
      expect(m).toHaveProperty('detectedAt');
      expect(typeof m.id).toBe('string');
      expect(typeof m.content).toBe('string');
      expect(Array.isArray(m.matchedKeywords)).toBe(true);
      expect(m.matchedKeywords.length).toBeGreaterThan(0);
    }
  });

  // 4.4 classifySeverity returns critical for credential dumps
  it('4.4 classifySeverity returns critical for credential dumps', () => {
    const severity = monitor.classifySeverity('high', 'credentials');
    expect(severity).toBe('critical');
  });

  // 4.5 classifySeverity returns critical for data sale (mapped to critical categories)
  it('4.5 classifySeverity returns critical for data sale', () => {
    const severity = monitor.classifySeverity('high', 'data_sale');
    expect(severity).toBe('critical');
  });

  // 4.6 classifySeverity returns medium for vuln discussion
  it('4.6 classifySeverity returns medium for vuln discussion', () => {
    // vuln_discussion is not in critical or high categories, so baseSeverity is returned
    const severity = monitor.classifySeverity('medium', 'vuln_discussion');
    expect(severity).toBe('medium');
  });

  // 4.7 classifySeverity returns low for generic mention
  it('4.7 classifySeverity returns low for generic mention', () => {
    const severity = monitor.classifySeverity('low', 'mention');
    expect(severity).toBe('low');
  });

  // 4.8 mentionsToAlertInputs produces valid alert inputs
  it('4.8 mentionsToAlertInputs produces valid alert inputs', () => {
    // Get some mentions first
    let mentions: ReturnType<DarkWebMonitor['scan']> = [];
    for (let i = 0; i < 50 && mentions.length === 0; i++) {
      mentions = monitor.scan('tenant-1', ['acmecorp'], [
        'paste_site', 'forum', 'marketplace', 'telegram', 'irc',
      ]);
    }
    expect(mentions.length).toBeGreaterThan(0);

    const alertInputs = monitor.mentionsToAlertInputs('asset-1', mentions);
    expect(alertInputs.length).toBe(mentions.length);

    for (const input of alertInputs) {
      expect(input.assetId).toBe('asset-1');
      expect(input.type).toBe('dark_web_mention');
      expect(input.title).toBeDefined();
      expect(input.title.length).toBeGreaterThan(0);
      expect(input.description).toBeDefined();
      expect(input.detectedValue).toBeDefined();
      expect(input.sourceUrl).toBeDefined();
      expect(Array.isArray(input.evidence)).toBe(true);
      expect(input.evidence.length).toBeGreaterThan(0);
    }
  });

  // 4.9 alert inputs have correct signals
  it('4.9 alert inputs have correct signals', () => {
    let mentions: ReturnType<DarkWebMonitor['scan']> = [];
    for (let i = 0; i < 50 && mentions.length === 0; i++) {
      mentions = monitor.scan('tenant-1', ['acmecorp'], [
        'paste_site', 'forum', 'marketplace', 'telegram', 'irc',
      ]);
    }
    expect(mentions.length).toBeGreaterThan(0);

    const alertInputs = monitor.mentionsToAlertInputs('asset-1', mentions);
    for (const input of alertInputs) {
      expect(input.signals.length).toBe(3);

      const signalTypes = input.signals.map((s) => s.signalType);
      expect(signalTypes).toContain('keyword_density');
      expect(signalTypes).toContain('source_reputation');
      expect(signalTypes).toContain('mention_recency');

      for (const sig of input.signals) {
        expect(sig.rawValue).toBeGreaterThan(0);
        expect(sig.rawValue).toBeLessThanOrEqual(1);
        expect(typeof sig.description).toBe('string');
      }
    }
  });

  // 4.10 source_reputation varies by source type
  it('4.10 source_reputation varies by source type', () => {
    // We test the mentionsToAlertInputs output for different sources
    // marketplace reputation should be higher than irc
    const marketplaceMention = {
      id: 'test-1',
      source: 'marketplace' as const,
      content: 'Test content',
      matchedKeywords: ['acmecorp'],
      url: 'https://market.sim/test',
      severity: 'critical' as const,
      detectedAt: new Date().toISOString(),
    };
    const ircMention = {
      id: 'test-2',
      source: 'irc' as const,
      content: 'Test content',
      matchedKeywords: ['acmecorp'],
      url: 'irc://test.sim/channel',
      severity: 'low' as const,
      detectedAt: new Date().toISOString(),
    };

    const marketplaceInputs = monitor.mentionsToAlertInputs('asset-1', [marketplaceMention]);
    const ircInputs = monitor.mentionsToAlertInputs('asset-1', [ircMention]);

    const marketplaceReputation = marketplaceInputs[0]!.signals.find(
      (s) => s.signalType === 'source_reputation',
    )!.rawValue;
    const ircReputation = ircInputs[0]!.signals.find(
      (s) => s.signalType === 'source_reputation',
    )!.rawValue;

    expect(marketplaceReputation).toBe(0.9);
    expect(ircReputation).toBe(0.4);
    expect(marketplaceReputation).toBeGreaterThan(ircReputation);
  });

  // 4.11 empty keywords returns no mentions
  it('4.11 empty keywords returns no mentions', () => {
    const mentions = monitor.scan('tenant-1', [], [
      'paste_site', 'forum', 'marketplace', 'telegram', 'irc',
    ]);
    expect(mentions.length).toBe(0);
  });

  // 4.12 scan with single source filters correctly
  it('4.12 scan with single source filters correctly', () => {
    // Only marketplace source — all mentions must be marketplace
    let mentions: ReturnType<DarkWebMonitor['scan']> = [];
    for (let i = 0; i < 50 && mentions.length === 0; i++) {
      mentions = monitor.scan('tenant-1', ['acmecorp'], ['marketplace']);
    }

    for (const m of mentions) {
      expect(m.source).toBe('marketplace');
    }
    // At least verify the scan ran without error
    expect(Array.isArray(mentions)).toBe(true);
  });
});
