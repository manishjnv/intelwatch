#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ETIP — One-Time VPS Setup Script
# Run as root on VPS: bash vps-setup.sh
# ═══════════════════════════════════════════════════════════════
# SAFETY: This script ONLY creates new files/directories.
#         It NEVER modifies existing configs or containers.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ETIP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ─── Pre-flight: verify existing site is healthy ──────────────
log "Pre-flight checks..."

log "Existing containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -v etip_ || true
echo ""

log "Checking no etip_ containers exist yet..."
if docker ps -a --format '{{.Names}}' | grep -q '^etip_'; then
    warn "ETIP containers already exist. This script is for first-time setup only."
    warn "To redeploy, use: docker compose -p etip -f docker-compose.etip.yml up -d"
    read -p "Continue anyway? (y/N): " confirm
    [[ "$confirm" != "y" ]] && exit 0
fi

log "Checking ports are free..."
for port in 5433 6380 9201 7475 7688 9001 9002 8080 8443 9190 3101; do
    if ss -tlnp | grep -q ":$port "; then
        err "Port $port is already in use! Aborting."
        ss -tlnp | grep ":$port "
        exit 1
    fi
done
log "All ETIP ports are free."

# ─── Step 1: Create ETIP directory ────────────────────────────
log "Creating /opt/intelwatch/ directory..."
mkdir -p /opt/intelwatch
cd /opt/intelwatch

# ─── Step 2: Clone or pull repo ───────────────────────────────
if [ -d ".git" ]; then
    log "Repo already cloned, pulling latest..."
    git pull origin master
else
    log "Cloning intelwatch repo..."
    git clone https://github.com/manishjnv/intelwatch.git .
fi

# ─── Step 3: Create .env from template if not exists ──────────
if [ ! -f ".env" ]; then
    log "Creating .env from .env.example..."
    cp .env.example .env
    warn "IMPORTANT: Edit /opt/intelwatch/.env with production secrets!"
    warn "At minimum, change all passwords and set TI_POSTGRES_PASSWORD, TI_REDIS_PASSWORD, etc."
else
    log ".env already exists, skipping."
fi

# ─── Step 4: Create docker support directories ────────────────
log "Creating docker support directories..."
mkdir -p docker/postgres
mkdir -p docker/nginx/conf.d
mkdir -p docker/prometheus
mkdir -p docker/grafana/provisioning/datasources

# Create postgres init script if missing
if [ ! -f "docker/postgres/init.sql" ]; then
    cat > docker/postgres/init.sql << 'SQLEOF'
-- ETIP PostgreSQL initialization
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQLEOF
    log "Created docker/postgres/init.sql"
fi

# Create prometheus config if missing
if [ ! -f "docker/prometheus/prometheus.yml" ]; then
    cat > docker/prometheus/prometheus.yml << 'PROMEOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
PROMEOF
    log "Created docker/prometheus/prometheus.yml"
fi

# Create grafana datasource if missing
if [ ! -f "docker/grafana/provisioning/datasources/prometheus.yml" ]; then
    cat > docker/grafana/provisioning/datasources/prometheus.yml << 'GRAFEOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://etip_prometheus:9090
    isDefault: true
GRAFEOF
    log "Created docker/grafana/provisioning/datasources/prometheus.yml"
fi

# Create ETIP internal nginx config if missing
if [ ! -f "docker/nginx/nginx.conf" ]; then
    cat > docker/nginx/nginx.conf << 'NGXEOF'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 50M;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    include /etc/nginx/conf.d/*.conf;
}
NGXEOF
    log "Created docker/nginx/nginx.conf"
fi

if [ ! -f "docker/nginx/conf.d/default.conf" ]; then
    cat > docker/nginx/conf.d/default.conf << 'CONFEOF'
# ETIP internal routing (inside etip_nginx container)
# Listens on port 80 inside container, mapped to 8080 on host

server {
    listen 80;
    server_name _;

    # Health check
    location /health {
        return 200 '{"status":"ok","service":"etip-nginx"}';
        add_header Content-Type application/json;
    }

    # Placeholder until frontend is built (Phase 8)
    location / {
        return 200 '<!DOCTYPE html><html><head><title>ETIP</title></head><body style="background:#0a0a0a;color:#00ff88;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>ETIP v4.0</h1><p>Enterprise Threat Intelligence Platform</p><p style="color:#666">Phase 1 — Infrastructure Running</p></div></body></html>';
        add_header Content-Type text/html;
    }

    # API proxy (uncomment when api-gateway is deployed)
    # location /api/ {
    #     proxy_pass http://etip_api_gateway:3001;
    #     proxy_http_version 1.1;
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #     proxy_set_header X-Forwarded-Proto $scheme;
    # }

    # WebSocket proxy (uncomment when ready)
    # location /ws/ {
    #     proxy_pass http://etip_api_gateway:3001;
    #     proxy_http_version 1.1;
    #     proxy_set_header Upgrade $http_upgrade;
    #     proxy_set_header Connection "upgrade";
    # }
}
CONFEOF
    log "Created docker/nginx/conf.d/default.conf"
fi

# ─── Step 5: Add Nginx server block for ti.intelwatch.in ─────
log "Setting up Nginx server block for ti.intelwatch.in..."

NGINX_AVAILABLE="/etc/nginx/sites-available/ti.intelwatch.in"
NGINX_ENABLED="/etc/nginx/sites-enabled/ti.intelwatch.in"

if [ -f "$NGINX_AVAILABLE" ]; then
    warn "Server block already exists at $NGINX_AVAILABLE, skipping."
else
    cp infrastructure/nginx/ti.intelwatch.in "$NGINX_AVAILABLE"
    log "Copied server block to $NGINX_AVAILABLE"
fi

if [ ! -L "$NGINX_ENABLED" ]; then
    ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    log "Enabled server block"
fi

# Test nginx config before reloading
log "Testing Nginx configuration..."
nginx -t
if [ $? -ne 0 ]; then
    err "Nginx config test FAILED! Removing ETIP server block."
    rm -f "$NGINX_ENABLED"
    exit 1
fi

# Reload nginx (does NOT restart — zero downtime for existing site)
log "Reloading Nginx (zero-downtime)..."
systemctl reload nginx
log "Nginx reloaded. ti.intelwatch.in server block active."

# ─── Step 6: Start ETIP infrastructure containers ────────────
log "Starting ETIP containers..."
warn "Make sure you have edited /opt/intelwatch/.env with production passwords first!"
read -p "Start ETIP containers now? (y/N): " start_containers

if [[ "$start_containers" == "y" ]]; then
    docker compose -p etip -f docker-compose.etip.yml up -d
    log "Waiting for containers to start..."
    sleep 30

    log "Container status:"
    docker compose -p etip -f docker-compose.etip.yml ps

    # Verify existing site is still healthy
    log "Verifying existing site is still running..."
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v etip_ || true
fi

# ─── Step 7: SSL Certificate ─────────────────────────────────
log ""
log "═══════════════════════════════════════════════════"
log " Setup complete!"
log "═══════════════════════════════════════════════════"
log ""
log "Next steps:"
log "  1. Edit /opt/intelwatch/.env with production secrets"
log "  2. Start containers: docker compose -p etip -f docker-compose.etip.yml up -d"
log "  3. Verify: curl http://ti.intelwatch.in/health"
log "  4. Add SSL: certbot --nginx -d ti.intelwatch.in"
log "  5. Verify: curl https://ti.intelwatch.in/health"
log ""
warn "Remember: NEVER touch containers/configs that don't have the etip_ prefix!"
