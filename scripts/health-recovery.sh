#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# ETIP Health Recovery — detects stopped/created containers and restarts them
# Runs via cron every 5 minutes on VPS.
#
# Install: crontab -e → */5 * * * * /opt/intelwatch/scripts/health-recovery.sh >> /var/log/etip-health-recovery.log 2>&1
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

COMPOSE_DIR="/opt/intelwatch"
COMPOSE_FILE="docker-compose.etip.yml"
PROJECT="etip"
LOG_PREFIX="[ETIP-HEALTH $(date -u '+%Y-%m-%d %H:%M:%S')]"

cd "$COMPOSE_DIR"

# ── Find containers in "Created" or "Exited" state ──────────────
UNHEALTHY=$(docker ps -a --filter "name=etip_" --filter "status=created" --filter "status=exited" --format '{{.Names}}' 2>/dev/null || true)

if [ -z "$UNHEALTHY" ]; then
  exit 0
fi

echo "$LOG_PREFIX Found stopped containers: $UNHEALTHY"

# ── Separate nginx (must start last) from other services ─────────
SERVICES=""
HAS_NGINX=false

for container in $UNHEALTHY; do
  if [ "$container" = "etip_nginx" ]; then
    HAS_NGINX=true
  else
    # Extract service name from container name (remove etip_ prefix)
    SERVICES="$SERVICES $container"
  fi
done

# ── Restart non-nginx services first ─────────────────────────────
if [ -n "$SERVICES" ]; then
  echo "$LOG_PREFIX Restarting services: $SERVICES"
  for svc in $SERVICES; do
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d "$svc" 2>&1 || true
  done
  # Wait for services to become healthy
  sleep 15
fi

# ── Restart nginx last (depends on other services) ───────────────
if [ "$HAS_NGINX" = true ]; then
  echo "$LOG_PREFIX Restarting etip_nginx"
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d etip_nginx 2>&1 || true
  sleep 5
fi

# ── Verify recovery ─────────────────────────────────────────────
STILL_DOWN=$(docker ps -a --filter "name=etip_" --filter "status=created" --filter "status=exited" --format '{{.Names}}' 2>/dev/null || true)

if [ -z "$STILL_DOWN" ]; then
  echo "$LOG_PREFIX Recovery successful — all containers running"
else
  echo "$LOG_PREFIX WARNING: containers still down after recovery: $STILL_DOWN"
fi
