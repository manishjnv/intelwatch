#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# wait-healthy.sh — Wait for all ETIP containers to report healthy
# Usage: bash scripts/wait-healthy.sh [timeout_seconds]
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

TIMEOUT=${1:-90}
INTERVAL=5
ELAPSED=0

REQUIRED_CONTAINERS=(
  etip_api
  etip_postgres
  etip_redis
  etip_frontend
  etip_nginx
)

echo "Waiting for containers to be healthy (timeout: ${TIMEOUT}s)..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  ALL_HEALTHY=true

  for container in "${REQUIRED_CONTAINERS[@]}"; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")

    if [ "$status" = "healthy" ]; then
      printf "  ✅ %-20s healthy\n" "$container"
    elif [ "$status" = "running" ] || [ "$status" = "" ]; then
      # Container has no healthcheck defined, check if running
      running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
      if [ "$running" = "true" ]; then
        printf "  ✅ %-20s running (no healthcheck)\n" "$container"
      else
        printf "  ⏳ %-20s %s\n" "$container" "$status"
        ALL_HEALTHY=false
      fi
    else
      printf "  ⏳ %-20s %s\n" "$container" "$status"
      ALL_HEALTHY=false
    fi
  done

  if $ALL_HEALTHY; then
    echo ""
    echo "All containers healthy after ${ELAPSED}s"
    exit 0
  fi

  echo "--- waiting ${INTERVAL}s (${ELAPSED}s / ${TIMEOUT}s) ---"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "❌ TIMEOUT: Not all containers healthy after ${TIMEOUT}s"
echo ""
echo "Container status:"
docker compose -p etip -f docker-compose.etip.yml ps
echo ""
echo "Recent API logs:"
docker logs etip_api --tail=20 2>&1 || true
exit 1
