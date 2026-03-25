#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Docker Cleanup — prune build cache + unused images
# Runs daily via cron. Keeps last 48h of cache for fast rebuilds.
# Install: cp scripts/docker-cleanup.sh /etc/cron.daily/docker-cleanup && chmod +x /etc/cron.daily/docker-cleanup
# ═══════════════════════════════════════════════════════════════

set -e

echo "[$(date -u)] Docker cleanup starting..."

# Prune build cache older than 48h
CACHE_FREED=$(docker builder prune -f --filter "until=48h" 2>&1 | tail -1)
echo "Build cache: $CACHE_FREED"

# Prune unused images older than 48h (running containers keep their images)
IMAGE_FREED=$(docker image prune -a -f --filter "until=48h" 2>&1 | tail -1)
echo "Images: $IMAGE_FREED"

echo "[$(date -u)] Docker cleanup done."
