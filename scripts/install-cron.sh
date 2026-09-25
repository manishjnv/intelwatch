#!/bin/bash
# Installs scripts/etip-cron as /etc/cron.d/etip and removes old root-crontab
# lines for the same jobs. Idempotent — safe to run on every deploy.
# Install: called automatically by scripts/deploy-vps.sh
set -euo pipefail

REPO_DIR="/opt/intelwatch"

install -m 0644 -o root -g root "$REPO_DIR/scripts/etip-cron" /etc/cron.d/etip
[ "$(tail -c1 /etc/cron.d/etip | xxd -p)" = "0a" ] && echo "etip-cron: trailing newline ok"
echo "Installed /etc/cron.d/etip"

BEFORE_FILE="/root/crontab.before-step1"
if [ ! -f "$BEFORE_FILE" ]; then
  crontab -l > "$BEFORE_FILE" 2>/dev/null || true
  echo "Saved current root crontab to $BEFORE_FILE"
fi

CURRENT="$(crontab -l 2>/dev/null || true)"
if [ -n "$CURRENT" ] && echo "$CURRENT" | grep -Eq '/opt/intelwatch/scripts/(health-recovery|etip-backup|docker-cleanup)\.sh'; then
  echo "$CURRENT" | { grep -Ev '/opt/intelwatch/scripts/(health-recovery|etip-backup|docker-cleanup)\.sh' || true; } | crontab -
  echo "Removed duplicate health-recovery/etip-backup/docker-cleanup lines from root crontab"
else
  echo "No matching lines in root crontab — left unchanged"
fi

cat > /etc/logrotate.d/etip << 'EOF'
/var/log/etip-health-recovery.log
/var/log/etip-backup.log
/var/log/etip-docker-cleanup.log
{
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF
chmod 0644 /etc/logrotate.d/etip
echo "Wrote /etc/logrotate.d/etip"
