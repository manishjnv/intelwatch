#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Session 81 — VPS Feed Activation & Pipeline Health Verification
# Run ON the VPS:  bash /opt/intelwatch/scripts/session81-vps-activate.sh
# ═══════════════════════════════════════════════════════════════════

set -eo pipefail

SUPER_TENANT="10c895c3-c42c-4054-85e8-f5af359c70c7"
POSTGRES_CONTAINER="etip_postgres"
INGESTION_PORT=3004
NORMALIZATION_PORT=3005
CUSTOMIZATION_PORT=3017
ADMIN_PORT=3022
ES_PORT=3020
GRAPH_PORT=3012

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step=0
total_steps=6

print_step() {
  step=$((step + 1))
  echo ""
  echo -e "${CYAN}━━━ Step $step/$total_steps: $1 ━━━${NC}"
  echo ""
}

ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "  $1"; }

# ── Step 1: Clean corrupted FeedSource rows ──────────────────────

print_step "Clean corrupted FeedSource rows (non-UUID tenant_id)"

if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  fail "Container $POSTGRES_CONTAINER not running"
  exit 1
fi

# Count before delete
BAD_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U etip_user -d etip -t -A -c \
  "SELECT COUNT(*) FROM feed_sources WHERE tenant_id !~ E'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$'" 2>&1 || echo "ERROR")

echo "  DEBUG: BAD_COUNT raw = [$BAD_COUNT]"

if echo "$BAD_COUNT" | grep -qi "error\|does not exist\|no relation"; then
  warn "Could not query feed_sources — table may not exist. Skipping cleanup."
  BAD_COUNT=0
elif [ -z "$BAD_COUNT" ] || [ "$BAD_COUNT" = "0" ]; then
  ok "No corrupted rows found — skipping"
  BAD_COUNT=0
else
  info "Found $BAD_COUNT corrupted rows, deleting..."
  docker exec "$POSTGRES_CONTAINER" psql -U etip_user -d etip -c \
    "DELETE FROM feed_sources WHERE tenant_id !~ E'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$'"
  ok "Deleted $BAD_COUNT corrupted FeedSource rows"
fi

# ── Step 2: Seed feeds ───────────────────────────────────────────

print_step "Run seed-feeds.sh"

SEED_SCRIPT="/opt/intelwatch/scripts/seed-feeds.sh"
if [ ! -f "$SEED_SCRIPT" ]; then
  fail "seed-feeds.sh not found at $SEED_SCRIPT"
  exit 1
fi

if bash "$SEED_SCRIPT"; then
  ok "Feed seeder completed"
else
  warn "Feed seeder exited with errors — continuing anyway"
fi

# ── Step 3: Assign Enterprise plan to super admin tenant ─────────

print_step "Assign Enterprise plan to tenant $SUPER_TENANT"

PLAN_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "http://localhost:${CUSTOMIZATION_PORT}/api/v1/customization/feed-quota/tenants/${SUPER_TENANT}/plan" \
  -H 'Content-Type: application/json' \
  -d '{"planId":"enterprise"}')

if [ "$PLAN_RESP" = "200" ] || [ "$PLAN_RESP" = "201" ] || [ "$PLAN_RESP" = "204" ]; then
  ok "Enterprise plan assigned (HTTP $PLAN_RESP)"
else
  warn "Plan assignment returned HTTP $PLAN_RESP — may need manual check"
  # Don't exit, feed activation is more important
fi

# ── Step 4: Verify pipeline health ──────────────────────────────

print_step "Pipeline health check (initial snapshot)"

echo "  --- Services ---"
SERVICES_UP=0
SERVICES_TOTAL=0
for port in 3001 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013 3014 3015 3016 3017 3018 3019 3020 3021 3022 3023 3024 3025; do
  SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 --connect-timeout 3 "http://localhost:${port}/health" 2>/dev/null) || HTTP="000"
  if [ "$HTTP" = "200" ]; then
    SERVICES_UP=$((SERVICES_UP + 1))
  else
    warn "Port $port returned HTTP $HTTP"
  fi
done
ok "Services: $SERVICES_UP/$SERVICES_TOTAL healthy"

echo ""
echo "  --- Feed Count ---"
FEED_COUNT=$(curl -s "http://localhost:${INGESTION_PORT}/api/v1/feeds?limit=500" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  feeds = d.get('data', [])
  print(len(feeds))
  for f in feeds:
    name = f.get('name', '?')
    enabled = f.get('enabled', False)
    tid = f.get('tenantId', '?')[:8]
    icon = 'ON ' if enabled else 'OFF'
    print(f'    {icon}  {name}  (tenant: {tid}...)')
except: print('0')
" 2>/dev/null || echo "0")
info "Total feeds: $FEED_COUNT"

echo ""
echo "  --- IOC Count (baseline) ---"
IOC_BASELINE=$(curl -s "http://localhost:${NORMALIZATION_PORT}/api/v1/stats" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  total = d.get('data', {}).get('totalIocs', d.get('total', 0))
  print(total)
except: print('0')
" 2>/dev/null || echo "0")
info "IOC baseline count: $IOC_BASELINE"

echo ""
echo "  --- Queue Status ---"
curl -s "http://localhost:${ADMIN_PORT}/api/v1/admin/queues" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  queues = d.get('data', {}).get('queues', d.get('data', []))
  if isinstance(queues, list):
    active = [q for q in queues if q.get('waiting', 0) > 0 or q.get('active', 0) > 0]
    print(f'  Total queues: {len(queues)}, Active: {len(active)}')
    for q in active:
      print(f'    {q[\"name\"]:35s} waiting={q.get(\"waiting\",0):4d}  active={q.get(\"active\",0):3d}')
  else:
    print('  Queue data format unexpected')
except Exception as e:
  print(f'  Could not parse queue data: {e}')
" 2>/dev/null || warn "Queue endpoint unreachable"

echo ""
echo "  --- Elasticsearch ---"
curl -s "http://localhost:${ES_PORT}/health" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(f'  ES connected: {d.get(\"esConnected\", \"?\")}, Indexed docs: {d.get(\"indexedDocs\", \"?\")}')
except: print('  ES health unknown')
" 2>/dev/null || warn "ES indexing service unreachable"

echo ""
echo "  --- Neo4j (Threat Graph) ---"
curl -s "http://localhost:${GRAPH_PORT}/api/v1/graph/stats" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  data = d.get('data', {})
  print(f'  Nodes: {data.get(\"totalNodes\", \"?\")}, Relationships: {data.get(\"totalRelationships\", \"?\")}')
except: print('  Graph stats unknown')
" 2>/dev/null || warn "Threat graph service unreachable"

# ── Step 5: Wait and re-check ────────────────────────────────────

print_step "Wait 15 minutes for pipeline processing"

echo "  Waiting 15 minutes..."
echo "  Start: $(date '+%H:%M:%S')"
echo "  Check: $(date -d '+15 minutes' '+%H:%M:%S' 2>/dev/null || date -v+15M '+%H:%M:%S' 2>/dev/null || echo 'in 15 min')"
echo ""

for i in $(seq 1 15); do
  sleep 60
  echo -e "  ${CYAN}[$i/15 min]${NC} $(date '+%H:%M:%S')"
done

echo ""
echo "  --- IOC Count (after 15 min) ---"
IOC_AFTER=$(curl -s "http://localhost:${NORMALIZATION_PORT}/api/v1/stats" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  total = d.get('data', {}).get('totalIocs', d.get('total', 0))
  print(total)
except: print('0')
" 2>/dev/null || echo "0")
info "IOC count after 15 min: $IOC_AFTER"

IOC_AFTER=${IOC_AFTER:-0}
IOC_BASELINE=${IOC_BASELINE:-0}
IOC_DELTA=$((IOC_AFTER - IOC_BASELINE))
if [ "$IOC_DELTA" -gt 0 ]; then
  ok "Pipeline is processing! +$IOC_DELTA new IOCs"
else
  warn "No new IOCs after 15 min — check ingestion logs: docker logs etip_ingestion --tail 50"
fi

echo ""
echo "  --- Queue Status (after 15 min) ---"
curl -s "http://localhost:${ADMIN_PORT}/api/v1/admin/queues" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  queues = d.get('data', {}).get('queues', d.get('data', []))
  if isinstance(queues, list):
    active = [q for q in queues if q.get('waiting', 0) > 0 or q.get('active', 0) > 0]
    print(f'  Total queues: {len(queues)}, Active: {len(active)}')
    for q in active:
      print(f'    {q[\"name\"]:35s} waiting={q.get(\"waiting\",0):4d}  active={q.get(\"active\",0):3d}')
  else:
    print('  Queue data format unexpected')
except Exception as e:
  print(f'  Could not parse queue data: {e}')
" 2>/dev/null || warn "Queue endpoint unreachable"

# ── Step 6: External verification ────────────────────────────────

print_step "External endpoint verification"

echo "  --- Public API (ti.intelwatch.in) ---"
EXT_RESP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "https://ti.intelwatch.in/api/v1/feeds" 2>/dev/null || echo "000")
if [ "$EXT_RESP" = "200" ]; then
  EXT_FEEDS=$(curl -s "https://ti.intelwatch.in/api/v1/feeds" 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  feeds = d.get('data', [])
  real = [f for f in feeds if not f.get('isDemoData', False)]
  print(f'{len(real)} real feeds (of {len(feeds)} total)')
except: print('unknown')
" 2>/dev/null || echo "unknown")
  ok "Public feeds endpoint reachable: $EXT_FEEDS"
else
  warn "Public endpoint returned HTTP $EXT_RESP"
fi

# ── Summary ──────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  SESSION 81 — ACTIVATION SUMMARY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "  Corrupted rows cleaned : $BAD_COUNT"
echo "  Feeds seeded           : $FEED_COUNT total"
echo "  Enterprise plan        : HTTP $PLAN_RESP"
echo "  Services healthy       : $SERVICES_UP/$SERVICES_TOTAL"
echo "  IOC baseline           : $IOC_BASELINE"
echo "  IOC after 15 min       : $IOC_AFTER (+$IOC_DELTA)"
echo "  External API           : HTTP $EXT_RESP"
echo ""

if [ "$IOC_DELTA" -gt 0 ] && [ "$SERVICES_UP" -ge 20 ]; then
  echo -e "  ${GREEN}PIPELINE ACTIVE — feeds are flowing${NC}"
else
  echo -e "  ${YELLOW}NEEDS ATTENTION — check logs above${NC}"
fi

echo ""
echo "  Next: paste this output back to Claude for docs update"
echo ""
