#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# ETIP nightly backup (roadmap STEP_00B U8 / STEP_01).
# Postgres (pg_dump -Fc, run inside etip_postgres) + Redis AOF/RDB copy.
# Keeps 7 daily copies in /var/backups/etip. Copy them OFF the box too —
# a backup on the same disk does not survive a disk loss.
#
# Install (as root on the VPS):
#   30 2 * * * /opt/intelwatch/scripts/etip-backup.sh >> /var/log/etip-backup.log 2>&1
# Restore Postgres:
#   docker exec -i etip_postgres pg_restore -U <user> -d <db> --clean --if-exists < pg-<date>.dump
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_DIR="${ETIP_BACKUP_DIR:-/var/backups/etip}"
KEEP_DAYS="${ETIP_BACKUP_KEEP_DAYS:-7}"
STAMP="$(date -u '+%Y-%m-%d_%H%M')"

log() {
  echo "[ETIP-BACKUP $(date -u '+%Y-%m-%d %H:%M:%S')] $*"
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Read DB user/name from the running container (no secrets printed).
PG_USER="$(docker exec etip_postgres printenv POSTGRES_USER)"
PG_DB="$(docker exec etip_postgres printenv POSTGRES_DB)"

PG_FILE="$BACKUP_DIR/pg-$STAMP.dump"
docker exec etip_postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$PG_FILE.partial"
mv "$PG_FILE.partial" "$PG_FILE"
chmod 600 "$PG_FILE"
log "postgres ok $(du -h "$PG_FILE" | cut -f1) $PG_FILE"

# Redis: copy the persistence files (appendonly is on). Best effort.
if docker exec etip_redis sh -c 'test -d /data' 2>/dev/null; then
  docker exec etip_redis sh -c 'tar -C /data -cf - .' > "$BACKUP_DIR/redis-$STAMP.tar" 2>/dev/null \
    && chmod 600 "$BACKUP_DIR/redis-$STAMP.tar" \
    && log "redis ok $(du -h "$BACKUP_DIR/redis-$STAMP.tar" | cut -f1)" \
    || log "redis copy failed (non-fatal)"
fi

# Retention
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'pg-*.dump' -o -name 'redis-*.tar' \) -mtime +"$KEEP_DAYS" -delete
log "done (keeping ${KEEP_DAYS} days)"
