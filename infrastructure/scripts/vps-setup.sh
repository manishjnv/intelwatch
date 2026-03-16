#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ETIP — One-Time VPS Setup Script
# Run as root: bash /opt/intelwatch/infrastructure/scripts/vps-setup.sh
# SAFETY: ONLY creates new files. NEVER touches existing configs.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[ETIP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

log "═══ ETIP VPS Setup ═══"

# ── Pre-flight: existing site check ───────────────────────────
log "Existing containers (WILL NOT TOUCH):"
docker ps --format "  {{.Names}} — {{.Status}}" | grep -v etip_ || echo "  (none)"
echo ""

# ── Check ports are free ──────────────────────────────────────
log "Checking ETIP ports are free..."
CONFLICT=0
for port in 5433 6380 9201 7475 7688 9001 9002 8080 8443 9190 3101; do
    if ss -tlnp | grep -q ":$port "; then
        err "Port $port is in use!"
        CONFLICT=1
    fi
done
if [ $CONFLICT -eq 1 ]; then
    err "Port conflicts detected. Resolve before continuing."
    exit 1
fi
log "All ETIP ports are free."

# ── Create .env if missing ────────────────────────────────────
cd /opt/intelwatch
if [ ! -f ".env" ]; then
    log "Creating .env from .env.example..."
    cp .env.example .env
    warn "EDIT /opt/intelwatch/.env with real passwords before starting containers!"
else
    log ".env already exists."
fi

# ── Nginx server block for ti.intelwatch.in ───────────────────
NGINX_AVAIL="/etc/nginx/sites-available/ti.intelwatch.in"
NGINX_ENABLED="/etc/nginx/sites-enabled/ti.intelwatch.in"

if [ -f "$NGINX_AVAIL" ]; then
    warn "Nginx server block already exists, skipping."
else
    log "Installing ti.intelwatch.in Nginx server block..."
    cp infrastructure/nginx/ti.intelwatch.in "$NGINX_AVAIL"
    ln -sf "$NGINX_AVAIL" "$NGINX_ENABLED"

    log "Testing Nginx config..."
    if nginx -t 2>&1; then
        systemctl reload nginx
        log "Nginx reloaded — ti.intelwatch.in active (HTTP)"
    else
        err "Nginx test failed! Removing ETIP server block."
        rm -f "$NGINX_ENABLED" "$NGINX_AVAIL"
        exit 1
    fi
fi

# ── Start ETIP containers ────────────────────────────────────
log ""
warn "Before starting containers, make sure .env has real passwords!"
read -p "Start ETIP containers now? (y/N): " START
if [[ "$START" == "y" ]]; then
    docker compose -p etip -f docker-compose.etip.yml up -d
    log "Waiting 30s for containers..."
    sleep 30
    docker compose -p etip -f docker-compose.etip.yml ps
    echo ""
    log "Health check:"
    curl -sf http://127.0.0.1:8080/health && echo "" || warn "Health check pending"
    echo ""
    log "Existing site (should be unchanged):"
    docker ps --format "  {{.Names}} — {{.Status}}" | grep -v etip_ || true
fi

# ── Done ──────────────────────────────────────────────────────
log ""
log "═══════════════════════════════════════════════════"
log " Setup complete!"
log "═══════════════════════════════════════════════════"
log ""
log "Next steps:"
log "  1. Edit .env:  nano /opt/intelwatch/.env"
log "  2. Start:      docker compose -p etip -f docker-compose.etip.yml up -d"
log "  3. Verify:     curl http://ti.intelwatch.in/health"
log "  4. SSL:        certbot --nginx -d ti.intelwatch.in"
log "  5. Verify:     curl https://ti.intelwatch.in/health"
log ""
warn "NEVER touch containers/configs without the etip_ prefix!"
