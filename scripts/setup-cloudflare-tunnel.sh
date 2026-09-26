#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Cloudflare Tunnel Setup for ETIP VPS
#
# This creates a persistent SSH tunnel through Cloudflare, bypassing
# the hosting provider's port 22 filtering.
#
# Prerequisites:
#   - Cloudflare account with intelwatch.in domain
#   - Root access on VPS
#
# Usage: bash setup-cloudflare-tunnel.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

TUNNEL_NAME="etip-ssh"
SSH_HOSTNAME="ssh.intelwatch.in"

echo "═══ Cloudflare Tunnel Setup for ETIP ═══"
echo ""

# ── Step 1: Install cloudflared ──────────────────────────────────
if command -v cloudflared &>/dev/null; then
  echo "✓ cloudflared already installed: $(cloudflared --version)"
else
  echo "Installing cloudflared..."
  curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
  echo "✓ Installed: $(cloudflared --version)"
fi

echo ""

# ── Step 2: Authenticate with Cloudflare ─────────────────────────
if [ -d "$HOME/.cloudflared" ] && ls "$HOME/.cloudflared/"*.json &>/dev/null; then
  echo "✓ Already authenticated with Cloudflare"
else
  echo "Authenticating with Cloudflare..."
  echo "A browser window will open — log in and select the intelwatch.in domain."
  echo ""
  cloudflared tunnel login
  echo "✓ Authenticated"
fi

echo ""

# ── Step 3: Create tunnel ────────────────────────────────────────
EXISTING=$(cloudflared tunnel list --output json 2>/dev/null | grep -o "\"$TUNNEL_NAME\"" || true)
if [ -n "$EXISTING" ]; then
  echo "✓ Tunnel '$TUNNEL_NAME' already exists"
  TUNNEL_ID=$(cloudflared tunnel list --output json | python3 -c "import sys,json; tunnels=json.load(sys.stdin); print([t['id'] for t in tunnels if t['name']=='$TUNNEL_NAME'][0])" 2>/dev/null || true)
else
  echo "Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_ID=$(cloudflared tunnel list --output json | python3 -c "import sys,json; tunnels=json.load(sys.stdin); print([t['id'] for t in tunnels if t['name']=='$TUNNEL_NAME'][0])" 2>/dev/null || true)
  echo "✓ Tunnel created: $TUNNEL_ID"
fi

if [ -z "${TUNNEL_ID:-}" ]; then
  echo "Getting tunnel ID..."
  TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

echo "  Tunnel ID: $TUNNEL_ID"
echo ""

# ── Step 4: Create DNS route ────────────────────────────────────
echo "Creating DNS route: $SSH_HOSTNAME → tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$SSH_HOSTNAME" 2>/dev/null || echo "  (DNS route may already exist)"
echo "✓ DNS route configured"
echo ""

# ── Step 5: Write config ────────────────────────────────────────
CRED_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
CONFIG_DIR="/etc/cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"

mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" << CFEOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED_FILE}

ingress:
  - hostname: ${SSH_HOSTNAME}
    service: ssh://localhost:22
  - service: http_status:404
CFEOF

echo "✓ Config written to $CONFIG_FILE"
echo ""

# ── Step 6: Install as systemd service ──────────────────────────
echo "Installing cloudflared as systemd service..."
cloudflared service install 2>/dev/null || echo "  (service may already be installed)"
systemctl enable cloudflared 2>/dev/null || true
systemctl restart cloudflared
sleep 3

if systemctl is-active --quiet cloudflared; then
  echo "✓ cloudflared service is running"
else
  echo "✗ cloudflared service failed to start. Check: journalctl -u cloudflared -n 20"
  exit 1
fi

echo ""

# ── Step 7: Verify tunnel ──────────────────────────────────────
echo "Verifying tunnel connectivity..."
sleep 5
STATUS=$(cloudflared tunnel info "$TUNNEL_NAME" 2>/dev/null | grep -i "status\|connector" | head -3 || echo "Check manually: cloudflared tunnel info $TUNNEL_NAME")
echo "$STATUS"
echo ""

# ── Done ────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Tunnel ready: $SSH_HOSTNAME"
echo ""
echo "  Next steps:"
echo "  1. Update GitHub Actions secrets:"
echo "     VPS_HOST → $SSH_HOSTNAME"
echo "     (keep VPS_USER and VPS_SSH_KEY the same)"
echo ""
echo "  2. Test from any machine:"
echo "     ssh -o ProxyCommand='cloudflared access ssh --hostname $SSH_HOSTNAME' root@$SSH_HOSTNAME"
echo ""
echo "  3. Or without cloudflared on client (TCP mode):"
echo "     Already works for GitHub Actions SSH action"
echo ""
echo "═══════════════════════════════════════════════════════"
