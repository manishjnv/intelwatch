/**
 * Seed script: Default Global Feeds for GlobalFeedCatalog.
 * DECISION-029 Phase D.
 *
 * Idempotent — upserts by name. Safe to run multiple times.
 *
 * Usage: npx tsx scripts/seed-global-feeds.ts
 * Requires: DATABASE_URL env var pointing to ETIP Postgres.
 */
import { PrismaClient } from '@prisma/client';

// ─── Admiralty Code → feedReliability score ────────────────────────────

const RELIABILITY_MAP: Record<string, number> = {
  A: 100, B: 80, C: 60, D: 40, E: 20, F: 0,
};

const CREDIBILITY_MAP: Record<number, number> = {
  1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 0,
};

function admiraltyToScore(sourceReliability: string, infoCred: number): number {
  const r = RELIABILITY_MAP[sourceReliability] ?? 50;
  const c = CREDIBILITY_MAP[infoCred] ?? 50;
  return Math.round((r + c) / 2);
}

// ─── Feed definitions ──────────────────────────────────────────────────

interface FeedSeed {
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

export const GLOBAL_FEED_SEEDS: FeedSeed[] = [
  {
    name: 'CISA Known Exploited Vulnerabilities',
    description: 'US CISA maintained list of actively exploited vulnerabilities requiring federal remediation.',
    feedType: 'rest', url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    sourceReliability: 'A', infoCred: 1, minPlanTier: 'free',
    industries: ['government', 'critical-infrastructure'], schedule: '0 */6 * * *',
  },
  {
    name: 'NVD CVE Feed',
    description: 'National Vulnerability Database — comprehensive CVE records with CVSS scoring.',
    feedType: 'nvd', url: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    sourceReliability: 'A', infoCred: 2, minPlanTier: 'free', schedule: '0 */4 * * *',
  },
  {
    name: 'AlienVault OTX Pulse Feed',
    description: 'Community threat intelligence pulses from AlienVault Open Threat Exchange.',
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
    description: 'CIRCL Computer Incident Response Center Luxembourg MISP community feeds.',
    feedType: 'misp', url: 'https://www.circl.lu/doc/misp/',
    sourceReliability: 'B', infoCred: 2, minPlanTier: 'teams', schedule: '0 */6 * * *',
  },
  {
    name: 'Emerging Threats Ruleset',
    description: 'Proofpoint Emerging Threats open ruleset for network-level threat detection.',
    feedType: 'rest', url: 'https://rules.emergingthreats.net/open/',
    sourceReliability: 'B', infoCred: 3, minPlanTier: 'starter', schedule: '0 */12 * * *',
  },
  {
    name: 'Tor Exit Nodes',
    description: 'Official Tor Project bulk exit node list — anonymity network indicators.',
    feedType: 'rest', url: 'https://check.torproject.org/torbulkexitlist',
    sourceReliability: 'A', infoCred: 1, minPlanTier: 'free', schedule: '0 */6 * * *',
  },
  {
    name: 'Blocklist.de',
    description: 'Community blocklist of IP addresses attacking services (SSH, mail, web).',
    feedType: 'rest', url: 'https://lists.blocklist.de/lists/all.txt',
    sourceReliability: 'C', infoCred: 3, minPlanTier: 'free', schedule: '0 */4 * * *',
  },
];

// ─── Seed function ─────────────────────────────────────────────────────

export async function seedGlobalFeeds(prisma: PrismaClient): Promise<number> {
  let created = 0;

  for (const feed of GLOBAL_FEED_SEEDS) {
    const feedReliability = admiraltyToScore(feed.sourceReliability, feed.infoCred);

    await prisma.globalFeedCatalog.upsert({
      where: { name: feed.name },
      update: {}, // Don't overwrite existing — idempotent
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
        feedReliability,
        enabled: true,
        subscriberCount: 0,
        consecutiveFailures: 0,
        totalItemsIngested: 0,
      },
    });
    created++;
  }

  return created;
}

// ─── CLI entry point ───────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('[seed-global-feeds] Seeding 10 default global feeds...');
    const count = await seedGlobalFeeds(prisma);
    console.log(`[seed-global-feeds] ✅ Upserted ${count} feeds`);

    // Verify
    const total = await prisma.globalFeedCatalog.count();
    console.log(`[seed-global-feeds] Total catalog entries: ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
const isDirectRun = process.argv[1]?.includes('seed-global-feeds');
if (isDirectRun) {
  main().catch((err) => {
    console.error('[seed-global-feeds] ❌ Failed:', err);
    process.exit(1);
  });
}
