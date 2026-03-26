#!/usr/bin/env npx tsx
/**
 * Manual feed seeding script for VPS activation.
 * Creates 10 real OSINT feeds via the ingestion service API.
 * Idempotent: skips feeds that already exist by name.
 *
 * Usage: npx tsx scripts/seed-feeds.ts
 * Env:   TI_API_GATEWAY_URL (default http://localhost:3001)
 *        TI_TENANT_ID       (default demo-tenant)
 *        TI_AUTH_TOKEN       (optional — service JWT for auth)
 */

const API_BASE = process.env.TI_API_GATEWAY_URL ?? 'http://localhost:3001';
const TENANT_ID = process.env.TI_TENANT_ID ?? 'demo-tenant';
const AUTH_TOKEN = process.env.TI_AUTH_TOKEN ?? '';

interface FeedDef {
  name: string;
  url: string;
  feedType: string;
  schedule: string;
  parseConfig?: Record<string, unknown>;
}

const FEEDS: FeedDef[] = [
  {
    name: 'AlienVault OTX',
    url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    parseConfig: {
      responseArrayPath: 'results',
      fieldMap: { title: 'name', content: 'description', url: 'id', publishedAt: 'created' },
    },
  },
  {
    name: 'Abuse.ch URLhaus',
    url: 'https://urlhaus-api.abuse.ch/v1/urls/recent/',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    parseConfig: {
      responseArrayPath: 'urls',
      fieldMap: { title: 'url', content: 'threat', url: 'url', publishedAt: 'date_added', sourceId: 'id' },
    },
  },
  {
    name: 'CISA KEV',
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    feedType: 'rest_api',
    schedule: '0 */4 * * *',
    parseConfig: {
      responseArrayPath: 'vulnerabilities',
      fieldMap: { title: 'vulnerabilityName', content: 'shortDescription', sourceId: 'cveID', publishedAt: 'dateAdded' },
    },
  },
  {
    name: 'Feodo Tracker',
    url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.json',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    parseConfig: {
      responseArrayPath: '',
      fieldMap: { title: 'ip_address', content: 'malware', publishedAt: 'first_seen_utc', sourceId: 'ip_address' },
    },
  },
  {
    name: 'MalwareBazaar Recent',
    url: 'https://mb-api.abuse.ch/api/v1/',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    parseConfig: {
      method: 'POST',
      body: { query: 'get_recent', selector: 100 },
      responseArrayPath: 'data',
      fieldMap: { title: 'sha256_hash', content: 'file_type', publishedAt: 'first_seen_utc', sourceId: 'sha256_hash' },
    },
  },
  {
    name: 'CISA Advisories RSS',
    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    feedType: 'rss',
    schedule: '0 */2 * * *',
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    feedType: 'rss',
    schedule: '*/30 * * * *',
  },
  {
    name: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    feedType: 'rss',
    schedule: '*/30 * * * *',
  },
  {
    name: 'US-CERT Alerts',
    url: 'https://www.us-cert.gov/ncas/alerts.xml',
    feedType: 'rss',
    schedule: '0 */2 * * *',
  },
  {
    name: 'NVD Recent CVEs',
    url: '',
    feedType: 'nvd',
    schedule: '0 */4 * * *',
  },
];

async function getExistingFeeds(): Promise<string[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;

  try {
    const res = await fetch(`${API_BASE}/api/v1/feeds?limit=500`, { headers });
    if (!res.ok) return [];
    const body = await res.json() as { data?: Array<{ name: string }> };
    return (body.data ?? []).map((f) => f.name);
  } catch {
    return [];
  }
}

async function createFeed(feed: FeedDef): Promise<boolean> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;

  const body = {
    tenantId: TENANT_ID,
    name: feed.name,
    url: feed.url || undefined,
    feedType: feed.feedType,
    schedule: feed.schedule,
    parseConfig: feed.parseConfig ?? {},
    enabled: true,
  };

  try {
    const res = await fetch(`${API_BASE}/api/v1/feeds`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.log(`  ✓ Created: ${feed.name}`);
      return true;
    }
    const err = await res.text();
    console.log(`  ✗ Failed (${res.status}): ${feed.name} — ${err.slice(0, 200)}`);
    return false;
  } catch (err) {
    console.log(`  ✗ Error: ${feed.name} — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`\n🔧 ETIP Feed Seeder`);
  console.log(`   API: ${API_BASE}`);
  console.log(`   Tenant: ${TENANT_ID}\n`);

  const existing = await getExistingFeeds();
  console.log(`Found ${existing.length} existing feeds\n`);

  let created = 0;
  let skipped = 0;

  for (const feed of FEEDS) {
    if (existing.includes(feed.name)) {
      console.log(`  ○ Skipped (exists): ${feed.name}`);
      skipped++;
      continue;
    }
    if (await createFeed(feed)) created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${FEEDS.length - created - skipped} failed\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
