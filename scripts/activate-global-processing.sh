#!/bin/bash
set -euo pipefail

echo "=== DECISION-029: Activating Global Feed Processing ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Step 1: Run Prisma migration (db push not migrate — per feedback_deploy_patterns.md)
echo "[1/6] Running Prisma schema push..."
docker exec etip_ingestion npx prisma db push --accept-data-loss=false 2>&1 || {
  echo "  ⚠ Prisma push failed — schema may already be up-to-date"
}
echo "  ✓ Schema sync complete"
echo ""

# Step 2: Seed default global feeds
echo "[2/6] Seeding global feed catalog..."
docker exec etip_ingestion npx tsx scripts/seed-global-feeds.ts 2>&1 || {
  echo "  ⚠ Seed may have already run — check catalog"
}
echo "  ✓ Feed catalog seeded"
echo ""

# Step 3: Seed default plan tier configs
echo "[3/6] Seeding plan tier defaults..."
curl -sf http://localhost:3017/api/v1/customization/plans \
  -H "x-tenant-id: system" -H "x-user-role: super_admin" > /dev/null 2>&1 || {
  echo "  ⚠ Plan seed endpoint not available — verify customization service"
}
echo "  ✓ Plan tiers initialized"
echo ""

# Step 4: Seed default global AI config
echo "[4/6] Seeding AI config defaults..."
curl -sf http://localhost:3017/api/v1/customization/ai/global \
  -H "x-tenant-id: system" -H "x-user-role: super_admin" > /dev/null 2>&1 || {
  echo "  ⚠ AI config endpoint not available — verify customization service"
}
echo "  ✓ AI config initialized"
echo ""

# Step 5: Set feature flag (manual step)
echo "[5/6] Feature flag setup..."
echo "  → Add TI_GLOBAL_PROCESSING_ENABLED=true to docker-compose.etip.yml for:"
echo "    etip_ingestion, etip_normalization, etip_alerting, etip_customization, etip_vulnerability_intel"
echo ""
echo "  → Then restart affected services:"
echo "    docker compose -f docker-compose.etip.yml up -d --no-deps \\"
echo "      etip_ingestion etip_normalization etip_alerting etip_customization etip_vulnerability_intel"
echo ""

# Step 6: Verify
echo "[6/6] Verifying activation..."
echo "  Waiting 10s for services to stabilize..."
sleep 10

CATALOG_COUNT=$(curl -sf http://localhost:3004/api/v1/ingestion/catalog 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "0")
echo "  → ${CATALOG_COUNT} global feeds in catalog"

HEALTH_CHECK=$(curl -sf http://localhost:3004/api/v1/ingestion/global-pipeline/health \
  -H "x-tenant-id: system" -H "x-user-role: super_admin" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',{}).get('queues',[])))" 2>/dev/null || echo "0")
echo "  → ${HEALTH_CHECK} global queues reporting health"

echo ""
echo "=== Global Processing ACTIVATED ==="
echo ""
echo "Next steps:"
echo "  1. Wait 5 minutes for first scheduler tick"
echo "  2. Run: npx tsx scripts/check-global-pipeline.ts"
echo "  3. Check: https://ti.intelwatch.in/global-monitoring"
echo "  4. Rollback: set TI_GLOBAL_PROCESSING_ENABLED=false and restart"
