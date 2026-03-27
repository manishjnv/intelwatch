/**
 * @module GlobalCatalogSeeder
 * @description Auto-seeds default OSINT feeds into GlobalFeedCatalog on startup.
 * Idempotent — upserts by name. Safe to run on every container restart.
 * DECISION-029 Phase D.
 */
import type { PrismaClient } from '@prisma/client';

const RELIABILITY: Record<string, number> = { A: 100, B: 80, C: 60, D: 40, E: 20, F: 0 };
const CREDIBILITY: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 0 };

function admiraltyToScore(rel: string, cred: number): number {
  return Math.round(((RELIABILITY[rel] ?? 50) + (CREDIBILITY[cred] ?? 50)) / 2);
}

interface FeedDef {
  name: string;
  description: string;
  feedType: string;
  url: string;
  sourceReliability: string;
  infoCred: number;
  minPlanTier: string;
  industries?: string[];
  schedule: string;
}

const DEFAULT_FEEDS: FeedDef[] = [
  {
    name: 'CISA Known Exploited Vulnerabilities',
    description: 'US CISA maintained list of actively exploited vulnerabilities.',
    feedType: 'rest', url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    sourceReliability: 'A', infoCred: 1, minPlanTier: 'free',
    industries: ['government', 'critical-infrastructure'], schedule: '0 */6 * * *',
  },
  {
    name: 'NVD CVE Feed',
    description: 'National Vulnerability Database — comprehensive CVE records with CVSS.',
    feedType: 'nvd', url: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    sourceReliability: 'A', infoCred: 2, minPlanTier: 'free', schedule: '0 */4 * * *',
  },
  {
    name: 'AlienVault OTX Pulse Feed',
    description: 'Community threat intelligence pulses from AlienVault OTX.',
    feedType: 'rest', url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
    sourceReliability: 'B', infoCred: 3, minPlanTier: 'starter', schedule: '*/30 * * * *',
  },
  {
    name: 'Abuse.ch URLhaus',
    description: 'Database of malicious URLs used for malware distribution.',
    feedType: 'rest', url: 'https://urlhaus-api.abuse.ch/v1/urls/recent/',
    sourceReliability: 'B', infoCred: 2, minPlanTier: 'free', schedule: '*/30 * * * *',
  },
  {
    name: 'Abuse.ch MalwareBazaar',
    description: 'Malware sample repository for threat intelligence sharing.',
    feedType: 'rest', url: 'https://mb-api.abuse.ch/api/v1/',
    sourceReliability: 'B', infoCred: 2, minPlanTier: 'free', schedule: '0 */2 * * *',
  },
  {
    name: 'PhishTank',
    description: 'Community-curated database of verified phishing sites.',
    feedType: 'rest', url: 'https://data.phishtank.com/data/online-valid.json',
    sourceReliability: 'C', infoCred: 3, minPlanTier: 'free', schedule: '0 */4 * * *',
  },
  {
    name: 'CIRCL MISP Default Feeds',
    description: 'CIRCL MISP community feeds for threat sharing.',
    feedType: 'misp', url: 'https://www.circl.lu/doc/misp/',
    sourceReliability: 'B', infoCred: 2, minPlanTier: 'teams', schedule: '0 */6 * * *',
  },
  {
    name: 'Emerging Threats Ruleset',
    description: 'Proofpoint open ruleset for network-level threat detection.',
    feedType: 'rest', url: 'https://rules.emergingthreats.net/open/',
    sourceReliability: 'B', infoCred: 3, minPlanTier: 'starter', schedule: '0 */12 * * *',
  },
  {
    name: 'Tor Exit Nodes',
    description: 'Official Tor Project bulk exit node list.',
    feedType: 'rest', url: 'https://check.torproject.org/torbulkexitlist',
    sourceReliability: 'A', infoCred: 1, minPlanTier: 'free', schedule: '0 */6 * * *',
  },
  {
    name: 'Blocklist.de',
    description: 'Community blocklist of IPs attacking services (SSH, mail, web).',
    feedType: 'rest', url: 'https://lists.blocklist.de/lists/all.txt',
    sourceReliability: 'C', infoCred: 3, minPlanTier: 'free', schedule: '0 */4 * * *',
  },
];

/**
 * Seeds default OSINT feeds into GlobalFeedCatalog if the table is empty.
 * Runs once on startup — skips if any feeds already exist.
 */
export async function seedGlobalCatalogIfEmpty(
  db: PrismaClient,
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  try {
    const count = await db.globalFeedCatalog.count();
    if (count > 0) {
      logger.info({ existingFeeds: count }, 'Global catalog already seeded — skipping');
      return;
    }

    logger.info('Global catalog is empty — seeding default OSINT feeds');

    for (const feed of DEFAULT_FEEDS) {
      await db.globalFeedCatalog.upsert({
        where: { name: feed.name },
        update: {},
        create: {
          name: feed.name,
          description: feed.description,
          feedType: feed.feedType,
          url: feed.url,
          sourceReliability: feed.sourceReliability,
          infoCred: feed.infoCred,
          minPlanTier: feed.minPlanTier,
          industries: feed.industries ?? [],
          schedule: feed.schedule,
          feedReliability: admiraltyToScore(feed.sourceReliability, feed.infoCred),
          enabled: true,
          subscriberCount: 0,
          consecutiveFailures: 0,
          totalItemsIngested: 0,
        },
      });
    }

    logger.info({ seeded: DEFAULT_FEEDS.length }, 'Global catalog seeded with default OSINT feeds');
  } catch (err) {
    // Non-fatal — catalog can be populated later via API
    logger.warn({ err }, 'Failed to seed global catalog — will retry on next restart');
  }
}
