# Uptime Alerts Runbook

Owner setup + on-call playbook for the outside uptime monitors added in Step 1 (docs/S150_STEP1_STAY_UP.md). Related: docs/S148_NGINX_OUTAGE.md (the 46 h outage this exists to prevent).

## 1. Monitors

All 3 created 2026-09-26, free UptimeRobot plan, 5-min interval.

| URL | Type | Expected | Alerts when |
|---|---|---|---|
| `https://intelwatch.in/` | HTTP | 200 | non-200 |
| `https://intelwatch.in/health` | Keyword | contains `"status":"ok"` | keyword missing or non-200 |
| `https://intelwatch.in/login` | HTTP | 200 | non-200 |

`/api/v1/health` returns 404 by design (api-gateway registers `/health` with no `/api/v1` prefix) — do not monitor it. Monitor `/health` instead.

Free-tier API is read-only for monitors (`newMonitor` → `access_denied`). Create/edit monitors in the UptimeRobot dashboard, not the API. The API key (`UptimeRobot_API_Key`) lives in the local `.env`, never committed.

## 2. Owner setup

### UptimeRobot
1. Sign in to the UptimeRobot dashboard (account = owner's Gmail).
2. Create the 3 monitors above (5-min interval).
3. New-dashboard UptimeRobot has no separate alert-contact step — the login email is the default contact. No extra wiring needed for email alerts.

### Gmail filter (alerts land in "Updates" tab by default)
1. Gmail → Settings → Filters and Blocked Addresses → Create a new filter.
2. From: `alert@uptimerobot.com` (or the sender shown on a real alert).
3. Actions: check "Mark as important" and "Categorize as: Primary". Apply.

### GitHub Actions failed-run email
Already done: Settings → Notifications → Actions → "GitHub" + "Email", failed workflows only. A red deploy is now an email, not just a red dot.

### Telegram bot (owner opted in; not created yet)
1. Open Telegram, message `@BotFather` → `/newbot` → follow the prompts → save the bot token.
2. Send the new bot any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy the `chat.id` from the JSON.
3. On the VPS, add two lines to `/opt/intelwatch/.env`:
   ```
   TI_ALERT_TELEGRAM_BOT_TOKEN=<token>
   TI_ALERT_TELEGRAM_CHAT_ID=<chat id>
   ```
4. `scripts/health-recovery.sh` reads both from `.env` and sends a Telegram message only when it acts (container restart, unhealthy recovery, give-up after 3 restarts/hour). Silent no-op if either var is unset — no code change needed once the vars are set.

## 3. When an alert fires

Do these in order; stop as soon as the cause is found.

1. **Confirm from a phone (not the VPS network):**
   ```
   https://intelwatch.in/health
   ```
   Expect `{"status":"ok",...}`. If it loads fine, the alert may already have self-recovered — check UptimeRobot's "up" follow-up message before doing anything else.

2. **Check the last few deploys:**
   ```bash
   gh run list --workflow=deploy.yml -L 3
   ```
   A red run around the alert time is the likely cause.

3. **SSH in** (VS Code prompt, or directly):
   ```bash
   ssh -o ProxyCommand="cloudflared access ssh --hostname ssh.intelwatch.in" root@ssh.intelwatch.in
   ```

4. **Look for stuck containers:**
   ```bash
   docker ps -a --filter name=etip_ --filter status=created --filter status=exited
   ```
   Non-empty output is the S148 failure mode (SSH dropped mid-deploy). `scripts/health-recovery.sh` should already have restarted these within 5 min — if they're still stuck, health-recovery itself may not be running (see step 5).

5. **Check health-recovery is actually running:**
   ```bash
   tail /var/log/etip-health-recovery.log
   ```
   No output, or a gap longer than 5 min, means the cron job isn't firing — check `/etc/cron.d/etip` exists and cron is enabled.

6. **Check the latest deploy log:**
   ```bash
   ls -lt /var/log/etip-deploy | head
   tail -100 /var/log/etip-deploy/<sha>.log
   ```

If none of the above shows the cause, escalate to a manual `docker compose -p etip -f docker-compose.etip.yml up -d` and re-check `/health`.

## 4. Pausing alerts for planned maintenance

In the UptimeRobot dashboard, select the 3 monitors → "Pause". Resume the same way when maintenance is done. Pausing does not affect the app — it only stops UptimeRobot from checking and alerting.
