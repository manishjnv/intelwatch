#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Docker Cleanup — ETIP-only image pruning. Never touches images or
# containers belonging to other projects sharing this VPS.
# Runs daily via cron. Install: via scripts/install-cron.sh (writes
# /etc/cron.d/etip from scripts/etip-cron).
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

log() {
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Docker cleanup starting..."

# ── In-use image IDs (never remove these) ──
IN_USE_IDS="$(docker ps -a --format '{{.Image}}' | xargs -r -I{} docker inspect --format '{{.Id}}' {} 2>/dev/null | sort -u || true)"

# ── ETIP images older than 48h, not in use ──
docker images --no-trunc --format '{{.Repository}}\t{{.ID}}\t{{.CreatedAt}}' | while IFS=$'\t' read -r repo id created; do
  case "$repo" in
    etip-backend|etip-frontend|*/etip-backend|*/etip-frontend) ;;
    *) continue ;;
  esac
  echo "$IN_USE_IDS" | grep -qx "$id" && continue
  CREATED_EPOCH="$(date -d "$created" +%s 2>/dev/null || echo 0)"
  NOW_EPOCH="$(date +%s)"
  AGE=$(( (NOW_EPOCH - CREATED_EPOCH) / 3600 ))
  if [ "$AGE" -ge 48 ]; then
    docker rmi "$id" >/dev/null 2>&1 && log "removed $repo $id (age ${AGE}h)" || true
  fi
done

# ── Dangling ETIP images ──
docker images --filter dangling=true --format '{{.Repository}} {{.ID}}' | awk '$1 ~ "(^|/)etip-(backend|frontend)$" {print $2}' | while read -r id; do
  docker rmi "$id" >/dev/null 2>&1 && log "removed dangling image $id" || true
done

log "Docker cleanup done."
