#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# ETIP Health Recovery — restarts stopped/created containers, and
# unhealthy containers past their grace period. Runs via cron every
# 5 minutes on VPS.
#
# Install: via scripts/install-cron.sh (writes /etc/cron.d/etip from
# scripts/etip-cron). Do not add a crontab line manually.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

COMPOSE_DIR="/opt/intelwatch"
COMPOSE_FILE="docker-compose.etip.yml"
PROJECT="etip"
STATE_DIR="/var/lib/etip-health"
ENV_FILE="/opt/intelwatch/.env"

log() {
  echo "[ETIP-HEALTH $(date -u '+%Y-%m-%d %H:%M:%S')] $*"
}

alert() {
  local msg="$1"
  local token chat
  token="$(grep '^TI_ALERT_TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
  chat="$(grep '^TI_ALERT_TELEGRAM_CHAT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
  [ -n "$token" ] && [ -n "$chat" ] || return 0
  curl -s -m 10 -o /dev/null "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=[ETIP $(hostname)] ${msg}" || true
}

cd "$COMPOSE_DIR"

# ── Never act while a deploy holds the lock ──
# ponytail: test-and-release, never hold it (holding would make a deploy fail its flock -n)
flock -n /var/lock/etip-deploy.lock true || exit 0

mkdir -p "$STATE_DIR"

# ── Find containers in "Created" or "Exited" state ──────────────
UNHEALTHY=$(docker ps -a --filter "name=etip_" --filter "status=created" --filter "status=exited" --format '{{.Names}}' 2>/dev/null || true)

if [ -n "$UNHEALTHY" ]; then
  log "Found stopped containers: $UNHEALTHY"

  SERVICES=""
  HAS_NGINX=false
  for container in $UNHEALTHY; do
    if [ "$container" = "etip_nginx" ]; then
      HAS_NGINX=true
    else
      SERVICES="$SERVICES $container"
    fi
  done

  if [ -n "$SERVICES" ]; then
    log "Restarting services: $SERVICES"
    for svc in $SERVICES; do
      docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d "$svc" 2>&1 || true
    done
    sleep 15
  fi

  if [ "$HAS_NGINX" = true ]; then
    log "Restarting etip_nginx"
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d etip_nginx 2>&1 || true
    sleep 5
  fi

  STILL_DOWN=$(docker ps -a --filter "name=etip_" --filter "status=created" --filter "status=exited" --format '{{.Names}}' 2>/dev/null || true)
  if [ -z "$STILL_DOWN" ]; then
    log "Recovery successful — all containers running"
    alert "recovered stopped containers: $UNHEALTHY"
  else
    log "WARNING: containers still down after recovery: $STILL_DOWN"
    alert "still down after recovery: $STILL_DOWN"
  fi
fi

# ── Unhealthy containers past grace period ───────────────────────
NOW=$(date +%s)
UNHEALTHY_NOW=$(docker ps --filter "name=etip_" --filter "health=unhealthy" --format '{{.Names}}' 2>/dev/null || true)

for name in $UNHEALTHY_NOW; do
  SINCE_FILE="$STATE_DIR/${name}.since"
  RESTARTS_FILE="$STATE_DIR/${name}.restarts"
  GAVEUP_FILE="$STATE_DIR/${name}.gaveup"

  [ -f "$SINCE_FILE" ] || echo "$NOW" > "$SINCE_FILE"
  SINCE=$(cat "$SINCE_FILE")
  ELAPSED=$((NOW - SINCE))

  case "$name" in
    etip_elasticsearch|etip_neo4j) GRACE=1200 ;;
    *) GRACE=600 ;;
  esac

  [ "$ELAPSED" -ge "$GRACE" ] || continue

  touch "$RESTARTS_FILE"
  # prune restart timestamps older than 1h, count the rest
  awk -v now="$NOW" '(now - $1) < 3600' "$RESTARTS_FILE" > "${RESTARTS_FILE}.tmp" || true
  mv "${RESTARTS_FILE}.tmp" "$RESTARTS_FILE"
  RECENT_RESTARTS=$(wc -l < "$RESTARTS_FILE" | tr -d ' ')

  if [ "$RECENT_RESTARTS" -lt 3 ]; then
    log "Restarting unhealthy container: $name (unhealthy ${ELAPSED}s, grace ${GRACE}s)"
    docker restart "$name" 2>&1 || true
    echo "$NOW" >> "$RESTARTS_FILE"
    rm -f "$SINCE_FILE"
    alert "restarted unhealthy container $name (unhealthy ${ELAPSED}s)"
  else
    LAST_GAVEUP=0
    [ -f "$GAVEUP_FILE" ] && LAST_GAVEUP=$(cat "$GAVEUP_FILE")
    if [ $((NOW - LAST_GAVEUP)) -ge 3600 ]; then
      log "Giving up on $name — 3 restarts in the last hour"
      echo "$NOW" > "$GAVEUP_FILE"
      alert "gave up on $name — 3 restarts in the last hour, needs manual attention"
    fi
  fi
done

# ── Clear .since for containers no longer unhealthy ───────────────
for since_file in "$STATE_DIR"/*.since; do
  [ -e "$since_file" ] || continue
  base="$(basename "$since_file" .since)"
  echo "$UNHEALTHY_NOW" | grep -qx "$base" || rm -f "$since_file"
done

exit 0
