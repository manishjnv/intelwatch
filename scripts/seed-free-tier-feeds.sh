#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# ETIP Free Tier Feed Seeder — Seeds 3 default feeds for all tenants
# that have 0 feeds. Skips tenants that already have feeds.
#
# Idempotent: safe to re-run. Only creates missing feeds.
#
# Usage (on VPS):
#   bash /opt/intelwatch/scripts/seed-free-tier-feeds.sh
#
# Feeds seeded (Free tier defaults):
#   1. The Hacker News (RSS)
#   2. CISA Advisories RSS (RSS)
#   3. NVD Recent CVEs (NVD)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

CONTAINER="${CONTAINER:-etip_ingestion}"
SUPER_ADMIN_TENANT="10c895c3-80ba-4f8d-b48d-9e90d26b781b"

echo ""
echo "ETIP Free Tier Feed Seeder"
echo "   Container: $CONTAINER"
echo "   Super admin tenant: $SUPER_ADMIN_TENANT (will be skipped - already has 10 feeds)"
echo ""

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container $CONTAINER is not running"
  exit 1
fi

# Step 1: Get all tenant IDs from the database
echo "Querying tenants from database..."
TENANTS=$(docker exec etip_postgres psql -U etip_user -d etip -t -A -c \
  "SELECT DISTINCT tenant_id FROM feed_sources UNION SELECT DISTINCT tenant_id FROM articles;" 2>/dev/null || echo "")

if [ -z "$TENANTS" ]; then
  echo "No tenants found in database (or table doesn't exist yet). Nothing to seed."
  exit 0
fi

echo "Found tenants:"
echo "$TENANTS" | while read -r tid; do
  echo "  - $tid"
done
echo ""

# Step 2: For each tenant, check feed count and seed if 0
echo "$TENANTS" | while read -r TENANT_ID; do
  # Skip empty lines
  [ -z "$TENANT_ID" ] && continue

  # Skip super admin tenant (already has 10 feeds)
  if [ "$TENANT_ID" = "$SUPER_ADMIN_TENANT" ]; then
    echo "SKIP: $TENANT_ID (super admin, already has feeds)"
    continue
  fi

  # Check current feed count
  FEED_COUNT=$(docker exec etip_postgres psql -U etip_user -d etip -t -A -c \
    "SELECT COUNT(*) FROM feed_sources WHERE tenant_id='$TENANT_ID' AND enabled=true;" 2>/dev/null || echo "0")
  FEED_COUNT=$(echo "$FEED_COUNT" | tr -d '[:space:]')

  if [ "$FEED_COUNT" -gt 0 ] 2>/dev/null; then
    echo "SKIP: $TENANT_ID (already has $FEED_COUNT feeds)"
    continue
  fi

  echo "SEED: $TENANT_ID (0 feeds, seeding 3 free-tier defaults)"

  # Seed the 3 free-tier feeds
  docker exec "$CONTAINER" node -e "
const crypto = require('crypto');
const SECRET = process.env.TI_JWT_SECRET;
const TENANT = '$TENANT_ID';
const PORT = process.env.TI_INGESTION_PORT || 3004;
const API = 'http://localhost:' + PORT;

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
const header = base64url({ alg: 'HS256', typ: 'JWT' });
const now = Math.floor(Date.now() / 1000);
const payload = base64url({
  sub: 'seed-script', tenantId: TENANT, role: 'super_admin',
  email: 'system@etip.local', iat: now, exp: now + 300,
  iss: process.env.TI_JWT_ISSUER || 'intelwatch-etip'
});
const sig = crypto.createHmac('sha256', SECRET).update(header + '.' + payload).digest('base64url');
const token = header + '.' + payload + '.' + sig;

const FREE_FEEDS = [
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', feedType: 'rss', schedule: '0 */4 * * *' },
  { name: 'CISA Advisories RSS', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', feedType: 'rss', schedule: '0 */4 * * *' },
  { name: 'NVD Recent CVEs', url: '', feedType: 'nvd', schedule: '0 */4 * * *' },
];

async function seed() {
  let seeded = 0;
  for (const feed of FREE_FEEDS) {
    try {
      const res = await fetch(API + '/api/v1/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'x-tenant-id': TENANT },
        body: JSON.stringify({ ...feed, enabled: true, tags: ['DEMO'] }),
      });
      if (res.ok) { seeded++; console.log('  + ' + feed.name); }
      else { const err = await res.text(); console.log('  ! ' + feed.name + ': ' + res.status + ' ' + err.substring(0,100)); }
    } catch (e) { console.log('  ! ' + feed.name + ': ' + e.message); }
  }
  console.log('  Seeded ' + seeded + '/3 feeds for tenant ' + TENANT);
}
seed().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
"

done

echo ""
echo "Done. Free-tier feed seeding complete."
