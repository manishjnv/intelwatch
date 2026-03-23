import { randomUUID } from 'node:crypto';
import type { DRPStore } from '../schemas/store.js';
import type {
  DarkWebMention,
  DarkWebSourceType,
  DRPSeverity,
  AlertEvidence,
} from '../schemas/drp.js';

/** Simulated dark web data source entries. */
const SIMULATED_ENTRIES: Array<{
  source: DarkWebSourceType;
  template: string;
  baseSeverity: DRPSeverity;
  dataCategory: string;
}> = [
  { source: 'paste_site', template: 'Credential dump containing {keyword} accounts', baseSeverity: 'critical', dataCategory: 'credentials' },
  { source: 'paste_site', template: 'Email list from {keyword} domain leaked', baseSeverity: 'high', dataCategory: 'email_list' },
  { source: 'paste_site', template: 'Config files mentioning {keyword} infrastructure', baseSeverity: 'medium', dataCategory: 'config' },
  { source: 'forum', template: 'Thread discussing {keyword} vulnerabilities', baseSeverity: 'medium', dataCategory: 'vuln_discussion' },
  { source: 'forum', template: 'User offering access to {keyword} systems', baseSeverity: 'critical', dataCategory: 'access_sale' },
  { source: 'forum', template: 'Discussion about targeting {keyword} employees', baseSeverity: 'high', dataCategory: 'targeting' },
  { source: 'marketplace', template: '{keyword} customer database for sale', baseSeverity: 'critical', dataCategory: 'data_sale' },
  { source: 'marketplace', template: '{keyword} API keys available', baseSeverity: 'critical', dataCategory: 'credential_sale' },
  { source: 'marketplace', template: 'Phishing kit targeting {keyword} brand', baseSeverity: 'high', dataCategory: 'phishing_kit' },
  { source: 'telegram', template: 'Channel sharing {keyword} internal documents', baseSeverity: 'high', dataCategory: 'document_leak' },
  { source: 'telegram', template: 'Bot distributing {keyword} credential dumps', baseSeverity: 'critical', dataCategory: 'credentials' },
  { source: 'irc', template: 'Mentions of {keyword} in #hacking channel', baseSeverity: 'low', dataCategory: 'mention' },
  { source: 'irc', template: '{keyword} exploit discussion in underground IRC', baseSeverity: 'medium', dataCategory: 'exploit' },
];

/** Dark web monitoring with simulated feeds. */
export class DarkWebMonitor {
  constructor(_store: DRPStore) {
    // Store reserved for future persistence
  }

  /** Scan simulated dark web sources for keyword matches. */
  scan(
    _tenantId: string,
    keywords: string[],
    sources: DarkWebSourceType[],
  ): DarkWebMention[] {
    const mentions: DarkWebMention[] = [];
    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    for (const entry of SIMULATED_ENTRIES) {
      if (!sources.includes(entry.source)) continue;

      for (const keyword of lowerKeywords) {
        // Simulate match probability based on keyword length and source
        if (!this.shouldMatch(keyword, entry.source)) continue;

        const content = entry.template.replace(/\{keyword\}/g, keyword);
        mentions.push({
          id: randomUUID(),
          source: entry.source,
          content,
          matchedKeywords: [keyword],
          url: this.generateUrl(entry.source),
          severity: this.classifySeverity(entry.baseSeverity, entry.dataCategory),
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return mentions;
  }

  /** Classify the severity of a dark web mention. */
  classifySeverity(baseSeverity: DRPSeverity, dataCategory: string): DRPSeverity {
    const criticalCategories = ['credentials', 'credential_sale', 'data_sale', 'access_sale'];
    const highCategories = ['phishing_kit', 'targeting', 'document_leak', 'email_list'];

    if (criticalCategories.includes(dataCategory)) return 'critical';
    if (highCategories.includes(dataCategory)) return 'high';
    return baseSeverity;
  }

  /** Convert dark web mentions to DRP alert inputs. */
  mentionsToAlertInputs(
    assetId: string,
    mentions: DarkWebMention[],
  ): Array<{
    assetId: string;
    type: 'dark_web_mention';
    title: string;
    description: string;
    detectedValue: string;
    sourceUrl: string;
    evidence: AlertEvidence[];
    signals: Array<{ signalType: string; rawValue: number; description: string }>;
  }> {
    return mentions.map((m) => ({
      assetId,
      type: 'dark_web_mention' as const,
      title: `Dark web mention: ${m.content.slice(0, 80)}`,
      description: m.content,
      detectedValue: m.matchedKeywords.join(', '),
      sourceUrl: m.url,
      evidence: [{
        id: randomUUID(),
        type: 'paste_content' as const,
        title: `${m.source} content`,
        data: { source: m.source, content: m.content, url: m.url },
        collectedAt: m.detectedAt,
      }],
      signals: [
        { signalType: 'keyword_density', rawValue: 0.7 + Math.random() * 0.3, description: `Keyword "${m.matchedKeywords[0]}" found` },
        { signalType: 'source_reputation', rawValue: this.sourceReputation(m.source), description: `Source: ${m.source}` },
        { signalType: 'mention_recency', rawValue: 0.9, description: 'Recently detected' },
      ],
    }));
  }

  /** Source reputation score. */
  private sourceReputation(source: DarkWebSourceType): number {
    const scores: Record<string, number> = {
      marketplace: 0.9, forum: 0.7, paste_site: 0.6, telegram: 0.65, irc: 0.4,
    };
    return scores[source] ?? 0.5;
  }

  /** Simulated match probability. */
  private shouldMatch(_keyword: string, source: DarkWebSourceType): boolean {
    const baseRate: Record<string, number> = {
      paste_site: 0.4, forum: 0.3, marketplace: 0.2, telegram: 0.25, irc: 0.15,
    };
    return Math.random() < (baseRate[source] ?? 0.2);
  }

  /** Generate a simulated source URL. */
  private generateUrl(source: DarkWebSourceType): string {
    const id = randomUUID().slice(0, 8);
    const urls: Record<string, string> = {
      paste_site: `https://pastebin.sim/${id}`,
      forum: `https://forum.onion.sim/thread/${id}`,
      marketplace: `https://market.onion.sim/listing/${id}`,
      telegram: `https://t.me.sim/channel/${id}`,
      irc: `irc://underground.sim/#hack-${id}`,
    };
    return urls[source] ?? `https://darkweb.sim/${id}`;
  }
}
