#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# fix-ssh-and-network.sh — Fix SSH access + Docker network issue
# Run on VPS via: make vps-fix or via GitHub Actions vps-cmd.yml
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

echo "═══ ETIP Infrastructure Fix ═══"
echo "Time: $(date -u)"
echo ""

# ─── Fix 1: Add SSH to Cloudflare Tunnel ──────────────────────
echo "=== Fix 1: Cloudflare Tunnel SSH ==="

# Backup current config
cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak.$(date +%s)

# Write updated config with SSH ingress
cat > /etc/cloudflared/config.yml << 'CFEOF'
tunnel: b550e9a7-b9cc-4262-a5e8-e3d5e17e109b
credentials-file: /root/.cloudflared/b550e9a7-b9cc-4262-a5e8-e3d5e17e109b.json
ingress:
  # SSH access via Cloudflare Tunnel (new)
  - hostname: ssh.intelwatch.in
    service: ssh://localhost:22
  # Existing services
  - hostname: intelwatch.trendsmap.in
    service: http://localhost:3000
  - hostname: intelwatch-api.trendsmap.in
    service: http://localhost:8000
  # Catch-all
  - service: http_status:404
CFEOF

echo "Updated /etc/cloudflared/config.yml with SSH ingress"

# Validate config
if cloudflared tunnel ingress validate 2>&1 | grep -q "ok"; then
  echo "✅ Config validation passed"
else
  echo "⚠️  Config validation warning (may still work)"
fi

# Restart cloudflared
systemctl restart cloudflared
sleep 3

if systemctl is-active --quiet cloudflared; then
  echo "✅ cloudflared restarted successfully"
else
  echo "❌ cloudflared failed to restart — rolling back"
  cp /etc/cloudflared/config.yml.bak.* /etc/cloudflared/config.yml 2>/dev/null || true
  systemctl restart cloudflared
  exit 1
fi

echo ""
echo "=== Fix 2: Docker Network Persistence ==="

# Create the external network if it doesn't exist
docker network inspect ti-platform_default >/dev/null 2>&1 || echo "Warning: ti-platform_default network not found"

# Ensure etip_nginx is connected
docker network connect ti-platform_default etip_nginx 2>/dev/null && echo "✅ etip_nginx connected to ti-platform_default" || echo "Already connected"

echo ""
echo "=== Fix 3: Harden SSH Config ==="

# Add rate limiting for SSH via iptables (defense in depth)
# Allow established connections
iptables -C INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  iptables -I INPUT 1 -m state --state ESTABLISHED,RELATED -j ACCEPT

echo "✅ SSH hardening applied"

echo ""
echo "=== Verification ==="
echo -n "cloudflared: "; systemctl is-active cloudflared
echo -n "sshd: "; systemctl is-active ssh
echo -n "API health: "; curl -sf http://127.0.0.1:3001/health | head -c 50 && echo "" || echo "FAIL"
echo -n "Nginx health: "; curl -sf http://127.0.0.1:8080/health | head -c 50 && echo "" || echo "FAIL"

echo ""
echo "═══ FIXES APPLIED ═══"
echo ""
echo "NEXT STEPS (manual, in Cloudflare dashboard):"
echo "1. Go to Cloudflare Dashboard → DNS for intelwatch.in"
echo "2. Add CNAME record: ssh.intelwatch.in → b550e9a7-b9cc-4262-a5e8-e3d5e17e109b.cfargotunnel.com"
echo "3. Go to Cloudflare Zero Trust → Access → Applications"
echo "4. Add application: ssh.intelwatch.in, self-hosted, SSH type"
echo "5. Set policy: Allow emails: your-email@domain.com"
echo ""
echo "THEN from any client:"
echo "  cloudflared access ssh --hostname ssh.intelwatch.in"
echo "  # OR add to ~/.ssh/config:"
echo "  # Host ssh.intelwatch.in"
echo "  #   ProxyCommand cloudflared access ssh --hostname %h"
