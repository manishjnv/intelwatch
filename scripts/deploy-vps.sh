#!/bin/bash
# ETIP VPS deploy — invoked by .github/workflows/deploy.yml as: deploy-vps.sh <sha>
# Runs detached on the VPS; writes /var/log/etip-deploy/<sha>.status = ok|fail.
set -euo pipefail

SHA="${1:-}"
if ! [[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "usage: deploy-vps.sh <git-sha>" >&2
  exit 2
fi

LOG_DIR="/var/log/etip-deploy"
mkdir -p "$LOG_DIR"
STATUS_FILE="$LOG_DIR/$SHA.status"
ENV_FILE="/opt/intelwatch/.deploy.env"

exec 9>/var/lock/etip-deploy.lock
flock -n 9 || { echo "another deploy holds the lock"; echo fail > "$STATUS_FILE"; exit 1; }

echo running > "$STATUS_FILE"

DEPLOY_OK=false
cleanup() {
  rm -f "$ENV_FILE"
  docker logout ghcr.io >/dev/null 2>&1 || true
  if [ "$DEPLOY_OK" = true ]; then
    echo ok > "$STATUS_FILE"
  else
    echo fail > "$STATUS_FILE"
  fi
}
trap cleanup EXIT

cd /opt/intelwatch

# ── Parse secrets (never source, never echo) ──
GHCR_TOKEN=""
GHCR_OWNER=""
ANTHROPIC_KEY=""
AI_ENABLED=""
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      GHCR_TOKEN) GHCR_TOKEN="$v" ;;
      GHCR_OWNER) GHCR_OWNER="$v" ;;
      ANTHROPIC_KEY) ANTHROPIC_KEY="$v" ;;
      AI_ENABLED) AI_ENABLED="$v" ;;
    esac
  done < "$ENV_FILE"
fi

echo "=== ETIP Deploy Started ($SHA) ==="
echo "Time: $(date -u)"

# ── a. Sync AI config to .env (only when a value was provided) ──
sync_env_var() {
  local key="$1" val="$2"
  [ -n "$val" ] || return 0
  grep -v "^${key}=" .env > .env.tmp 2>/dev/null || true
  printf '%s=%s\n' "$key" "$val" >> .env.tmp
  chmod --reference=.env .env.tmp 2>/dev/null || chmod 600 .env.tmp
  mv .env.tmp .env
}
sync_env_var TI_ANTHROPIC_API_KEY "$ANTHROPIC_KEY"
sync_env_var TI_AI_ENABLED "$AI_ENABLED"

# ── b. Pull pre-built images from GHCR ──
if [ -z "$GHCR_TOKEN" ] || [ -z "$GHCR_OWNER" ]; then
  echo "missing GHCR_TOKEN/GHCR_OWNER in .deploy.env" >&2
  exit 1
fi
echo "Pulling pre-built images from GHCR..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin
docker pull "ghcr.io/$GHCR_OWNER/etip-backend:latest"
docker pull "ghcr.io/$GHCR_OWNER/etip-frontend:latest"
docker logout ghcr.io
rm -f "$ENV_FILE"
docker tag "ghcr.io/$GHCR_OWNER/etip-backend:latest" etip-backend:latest
docker tag "ghcr.io/$GHCR_OWNER/etip-frontend:latest" etip-frontend:latest

# ── c. Pre-cleanup: remove stale orphan containers (RCA #41) ──
echo "Removing stale orphan containers..."
docker ps -a --filter "status=created" --filter "status=exited" \
  --format "{{.Names}}" | grep "etip" | xargs -r docker rm -f 2>/dev/null || true

# ── d. Infra up (no recreate — preserves uptime) ──
echo "Starting infrastructure..."
docker compose -p etip -f docker-compose.etip.yml up -d etip_postgres etip_redis etip_elasticsearch etip_neo4j etip_minio etip_prometheus etip_grafana

# ── e. Schema sync — only when prisma/schema.prisma changed, with a pre-deploy dump ──
SCHEMA_FILE="prisma/schema.prisma"
SCHEMA_HASH_FILE="/var/lib/etip/schema.sha256"
mkdir -p /var/lib/etip

NEW_HASH="$(sha256sum "$SCHEMA_FILE" | awk '{print $1}')"
OLD_HASH=""
[ -f "$SCHEMA_HASH_FILE" ] && OLD_HASH="$(cat "$SCHEMA_HASH_FILE")"

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  echo "schema unchanged, skipping push"
else
  echo "schema changed — pre-deploy dump + push"

  LATEST_DUMP="$(ls -1t /var/backups/etip/pg-*.dump 2>/dev/null | head -1 || true)"
  if [ -n "$LATEST_DUMP" ]; then
    NEED_BYTES=$(( $(stat -c%s "$LATEST_DUMP") * 2 ))
  else
    NEED_BYTES=$((5 * 1024 * 1024 * 1024))
  fi
  AVAIL_BYTES="$(df --output=avail -B1 /var/backups 2>/dev/null | tail -1 | tr -d ' ')"
  if [ -z "$AVAIL_BYTES" ] || [ "$AVAIL_BYTES" -lt "$NEED_BYTES" ]; then
    echo "not enough disk space on /var/backups: need $NEED_BYTES bytes, have ${AVAIL_BYTES:-0}" >&2
    exit 1
  fi

  mkdir -p /var/backups/etip
  SHA12="${SHA:0:12}"
  PG_USER="$(docker exec etip_postgres printenv POSTGRES_USER)"
  PG_DB="$(docker exec etip_postgres printenv POSTGRES_DB)"
  PREDEPLOY_DUMP="/var/backups/etip/predeploy-$SHA12.dump"

  if ! timeout 480 docker exec etip_postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$PREDEPLOY_DUMP.partial"; then
    echo "pre-deploy dump failed or timed out" >&2
    rm -f "$PREDEPLOY_DUMP.partial"
    exit 1
  fi
  mv "$PREDEPLOY_DUMP.partial" "$PREDEPLOY_DUMP"
  chmod 600 "$PREDEPLOY_DUMP"

  ls -1t /var/backups/etip/predeploy-*.dump 2>/dev/null | tail -n +4 | xargs -r rm -f

  PUSH_OK=false
  for i in 1 2 3; do
    PUSH_LOG="$(mktemp)"
    if docker compose -p etip -f docker-compose.etip.yml run --rm --no-deps -T etip_api \
        npx prisma db push --schema=prisma/schema.prisma --skip-generate 2>&1 | tee "$PUSH_LOG"; then
      PUSH_OK=true
      rm -f "$PUSH_LOG"
      break
    fi
    if grep -qi 'data loss\|accept-data-loss' "$PUSH_LOG"; then
      echo "schema change would lose data — deploy aborted, apply manually" >&2
      rm -f "$PUSH_LOG"
      exit 1
    fi
    rm -f "$PUSH_LOG"
    [ "$i" -eq 3 ] || sleep 5
  done

  if [ "$PUSH_OK" != true ]; then
    echo "prisma db push failed after 3 attempts" >&2
    exit 1
  fi

  echo "$NEW_HASH" > "$SCHEMA_HASH_FILE"
  echo "schema synced, hash recorded"
fi

# ── f. Force recreate app containers (picks up new images + compose config) ──
echo "Recreating app containers..."
docker compose -p etip -f docker-compose.etip.yml up -d --force-recreate --remove-orphans etip_api etip_ingestion etip_normalization etip_enrichment etip_ioc_intelligence etip_threat_actor_intel etip_malware_intel etip_vulnerability_intel etip_threat_graph etip_correlation etip_hunting etip_drp etip_customization etip_integration etip_user_management etip_onboarding etip_billing etip_admin etip_es_indexing etip_reporting etip_alerting etip_analytics etip_caching etip_frontend etip_nginx

# ── g. Caddy network ──
docker restart ti-platform-caddy-1 2>/dev/null || echo "Caddy restart skipped"

# ── h. Parallel health checks ──
echo ""
echo "=== Health Checks (parallel) ==="

HEALTH_DIR=$(mktemp -d)
check_health() {
  local name="$1" port="$2" container="$3" critical="$4"
  for i in $(seq 1 12); do
    if curl -sf "http://127.0.0.1:${port}/health" > /dev/null 2>&1; then
      echo "${name}: healthy after $((i * 5))s"
      echo "ok" > "${HEALTH_DIR}/${container}"
      return 0
    fi
    sleep 5
  done
  if [ "$critical" = "yes" ]; then
    echo "${name}: FAILED after 60s"
    docker logs "$container" --tail 20 2>&1 || true
    echo "fail" > "${HEALTH_DIR}/${container}"
    return 1
  else
    echo "${name}: PENDING (non-critical)"
    echo "ok" > "${HEALTH_DIR}/${container}"
    return 0
  fi
}

check_health "API Gateway"        3001 etip_api                  yes &
check_health "Ingestion"           3004 etip_ingestion            no  &
check_health "Normalization"       3005 etip_normalization        yes &
check_health "Enrichment"          3006 etip_enrichment           yes &
check_health "IOC Intelligence"    3007 etip_ioc_intelligence     yes &
check_health "Threat Actor"        3008 etip_threat_actor_intel   yes &
check_health "Malware Intel"       3009 etip_malware_intel        yes &
check_health "Vulnerability"       3010 etip_vulnerability_intel  yes &
check_health "DRP Service"         3011 etip_drp                  no  &
check_health "Threat Graph"        3012 etip_threat_graph         no  &
check_health "Correlation"         3013 etip_correlation          no  &
check_health "Hunting"             3014 etip_hunting              no  &
check_health "Integration"         3015 etip_integration          no  &
check_health "User Management"     3016 etip_user_management      no  &
check_health "Customization"       3017 etip_customization        no  &
check_health "Onboarding"          3018 etip_onboarding           no  &
check_health "Billing"             3019 etip_billing              no  &
check_health "Admin"               3022 etip_admin                no  &
check_health "ES Indexing"         3020 etip_es_indexing          no  &
check_health "Reporting"           3021 etip_reporting            no  &
check_health "Alerting"            3023 etip_alerting             no  &
check_health "Analytics"           3024 etip_analytics            no  &
check_health "Caching"             3025 etip_caching              no  &

wait

echo -n "Nginx proxy: "
for i in 1 2 3 4 5 6; do
  if curl -sf http://127.0.0.1:8080/health > /dev/null 2>&1; then
    echo "healthy after $((i * 5))s"
    break
  fi
  if [ $i -eq 6 ]; then
    echo "FAILED after 30s"
    rm -rf "$HEALTH_DIR"
    exit 1
  fi
  sleep 5
done
echo -n "Frontend: "
curl -sf http://127.0.0.1:8080/login > /dev/null 2>&1 && echo "serving" || echo "PENDING"

if grep -rq "fail" "$HEALTH_DIR/" 2>/dev/null; then
  echo "Critical service(s) failed health check — deploy FAILED"
  rm -rf "$HEALTH_DIR"
  exit 1
fi
rm -rf "$HEALTH_DIR"

# ── i. Second pass: catch anything left Created, verify nginx again ──
echo "Second-pass compose up (no recreate)..."
docker compose -p etip -f docker-compose.etip.yml up -d --no-recreate
sleep 20
LEFTOVER="$(docker ps -a --filter name=etip_ --filter status=created --filter status=exited --format '{{.Names}}')"
if [ -n "$LEFTOVER" ]; then
  echo "containers still Created/Exited after second pass: $LEFTOVER" >&2
  exit 1
fi
curl -sf http://127.0.0.1:8080/health > /dev/null 2>&1 || { echo "final health check failed" >&2; exit 1; }

# ── j. Status ──
echo ""
echo "=== ETIP Container Status ==="
docker compose -p etip -f docker-compose.etip.yml ps

echo ""
echo "=== Existing Site (should be unchanged) ==="
docker ps --format '{{.Names}} {{.Status}}' | grep -v etip_ | head -5 || true

# ── k. Cleanup: only hash-prefixed orphans + dangling etip images ──
docker ps -a --format '{{.Names}}' | grep -E '^[0-9a-f]{12}_etip_' | xargs -r docker rm -f 2>/dev/null || true
docker images --filter dangling=true --format '{{.Repository}} {{.ID}}' | awk '$1 ~ "(^|/)etip-(backend|frontend)$" {print $2}' | xargs -r docker rmi 2>/dev/null || true

# ── l. Keep only the newest 20 log/status pairs ──
ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +21 | xargs -r rm -f
ls -1t "$LOG_DIR"/*.status 2>/dev/null | tail -n +21 | xargs -r rm -f

# ── m. Reinstall cron from git (non-fatal on failure) ──
bash /opt/intelwatch/scripts/install-cron.sh || echo "install-cron.sh failed (non-fatal)"

echo ""
echo "=== ETIP Deploy Complete ==="
DEPLOY_OK=true
