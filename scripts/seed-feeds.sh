#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# ETIP Feed Seeder — Creates 10 real OSINT feeds via ingestion API
# Runs inside etip_ingestion container (has Node.js + JWT secret).
#
# Usage (on VPS):  bash /opt/intelwatch/scripts/seed-feeds.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

CONTAINER="${CONTAINER:-etip_ingestion}"

echo ""
echo "🔧 ETIP Feed Seeder"
echo "   Container: $CONTAINER"
echo ""

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "✗ Container $CONTAINER is not running"
  exit 1
fi

# Run the seeder inside the container using Node.js
docker exec "$CONTAINER" node -e '
const jwt = require("jsonwebtoken");

const SECRET = process.env.TI_JWT_SECRET;
const TENANT = "demo-tenant";
const PORT = process.env.TI_INGESTION_PORT || 3004;
const API = `http://localhost:${PORT}`;

// Generate a valid admin JWT
const token = jwt.sign(
  { sub: "seed-script", tenantId: TENANT, role: "super_admin", email: "system@etip.local" },
  SECRET,
  { expiresIn: "5m", issuer: process.env.TI_JWT_ISSUER || "intelwatch-etip" }
);

const FEEDS = [
  { name:"AlienVault OTX", url:"https://otx.alienvault.com/api/v1/pulses/subscribed", feedType:"rest_api", schedule:"0 */2 * * *",
    parseConfig:{responseArrayPath:"results",fieldMap:{title:"name",content:"description",url:"id",publishedAt:"created"}} },
  { name:"Abuse.ch URLhaus", url:"https://urlhaus-api.abuse.ch/v1/urls/recent/", feedType:"rest_api", schedule:"0 */2 * * *",
    parseConfig:{responseArrayPath:"urls",fieldMap:{title:"url",content:"threat",url:"url",publishedAt:"date_added",sourceId:"id"}} },
  { name:"CISA KEV", url:"https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", feedType:"rest_api", schedule:"0 */4 * * *",
    parseConfig:{responseArrayPath:"vulnerabilities",fieldMap:{title:"vulnerabilityName",content:"shortDescription",sourceId:"cveID",publishedAt:"dateAdded"}} },
  { name:"Feodo Tracker", url:"https://feodotracker.abuse.ch/downloads/ipblocklist.json", feedType:"rest_api", schedule:"0 */2 * * *",
    parseConfig:{responseArrayPath:"",fieldMap:{title:"ip_address",content:"malware",publishedAt:"first_seen_utc",sourceId:"ip_address"}} },
  { name:"MalwareBazaar Recent", url:"https://mb-api.abuse.ch/api/v1/", feedType:"rest_api", schedule:"0 */2 * * *",
    parseConfig:{method:"POST",body:{query:"get_recent",selector:100},responseArrayPath:"data",fieldMap:{title:"sha256_hash",content:"file_type",publishedAt:"first_seen_utc",sourceId:"sha256_hash"}} },
  { name:"CISA Advisories RSS", url:"https://www.cisa.gov/cybersecurity-advisories/all.xml", feedType:"rss", schedule:"0 */2 * * *", parseConfig:{} },
  { name:"The Hacker News", url:"https://feeds.feedburner.com/TheHackersNews", feedType:"rss", schedule:"*/30 * * * *", parseConfig:{} },
  { name:"BleepingComputer", url:"https://www.bleepingcomputer.com/feed/", feedType:"rss", schedule:"*/30 * * * *", parseConfig:{} },
  { name:"US-CERT Alerts", url:"https://www.us-cert.gov/ncas/alerts.xml", feedType:"rss", schedule:"0 */2 * * *", parseConfig:{} },
  { name:"NVD Recent CVEs", feedType:"nvd", schedule:"0 */4 * * *", parseConfig:{} },
];

async function getExistingNames() {
  try {
    const r = await fetch(`${API}/api/v1/feeds?limit=500`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return [];
    const b = await r.json();
    return (b.data || []).map(f => f.name);
  } catch { return []; }
}

async function main() {
  const existing = await getExistingNames();
  console.log(`Found ${existing.length} existing feeds\n`);
  let created = 0, skipped = 0, failed = 0;

  for (const feed of FEEDS) {
    if (existing.includes(feed.name)) {
      console.log(`  o Skipped (exists): ${feed.name}`);
      skipped++;
      continue;
    }
    try {
      const body = { tenantId: TENANT, ...feed, enabled: true };
      const r = await fetch(`${API}/api/v1/feeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (r.ok) { console.log(`  + Created: ${feed.name}`); created++; }
      else { const t = await r.text(); console.log(`  x Failed (${r.status}): ${feed.name} -- ${t.slice(0,150)}`); failed++; }
    } catch (e) { console.log(`  x Error: ${feed.name} -- ${e.message}`); failed++; }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
'

echo "Seeding complete."
