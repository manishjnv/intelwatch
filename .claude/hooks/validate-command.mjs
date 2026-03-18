#!/usr/bin/env node
/**
 * PreToolUse hook: Blocks dangerous bash commands.
 * Exit code 0 = allow, exit code 2 = deny.
 *
 * PROTECTION LAYERS:
 * 1. Blocks destructive system commands (rm -rf, DROP TABLE)
 * 2. Blocks live site interference (ti-platform containers, SSH)
 * 3. Blocks non-ETIP docker compose operations
 * 4. Warns on potentially risky but allowed commands
 */
import { readFileSync } from 'fs';

let input;
try {
  input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0); // Can't parse → allow (non-bash tool)
}

const cmd = input?.tool_input?.command || '';

// === HARD BLOCKS (exit 2 = deny) ===
const BLOCKED = [
  // Destructive filesystem
  { pattern: /rm\s+-rf\s+\//, reason: 'rm -rf on root path' },
  { pattern: /rm\s+-rf\s+\.\/?$/, reason: 'rm -rf on current directory' },

  // SQL destructive
  { pattern: /DROP\s+TABLE/i, reason: 'DROP TABLE' },
  { pattern: /DROP\s+DATABASE/i, reason: 'DROP DATABASE' },
  { pattern: /TRUNCATE\s+/i, reason: 'TRUNCATE' },

  // Live site protection
  { pattern: /docker\s+stop\s+ti-platform/, reason: 'stopping live site container' },
  { pattern: /docker\s+restart\s+ti-platform(?!-caddy)/, reason: 'restarting live site container (except caddy)' },
  { pattern: /docker\s+rm\s+.*ti-platform/, reason: 'removing live site container' },
  { pattern: /docker\s+compose.*-f(?!.*etip).*\s+(down|stop|rm)/, reason: 'non-ETIP compose destructive op' },

  // VPS access
  { pattern: /ssh\s+root@/, reason: 'SSH to VPS' },
  { pattern: /scp\s+/, reason: 'SCP file transfer' },

  // Docker destructive
  { pattern: /docker\s+system\s+prune/, reason: 'docker system prune' },
  { pattern: /docker\s+volume\s+rm/, reason: 'docker volume rm' },
  { pattern: /docker\s+network\s+rm/, reason: 'docker network rm' },

  // Git force push
  { pattern: /git\s+push\s+--force/, reason: 'git force push' },
  { pattern: /git\s+push\s+-f\b/, reason: 'git force push' },

  // Nginx global stop
  { pattern: /nginx\s+-s\s+stop/, reason: 'stopping nginx globally' },
];

for (const { pattern, reason } of BLOCKED) {
  if (pattern.test(cmd)) {
    console.error(`🛑 BLOCKED: "${cmd}"\n   Reason: ${reason}`);
    process.exit(2);
  }
}

// === WARNINGS (allow but alert) ===
const WARN = [
  { pattern: /docker\s+compose\s+down/, reason: 'docker compose down — verify this is etip only' },
  { pattern: /docker\s+compose\s+build/, reason: 'docker compose build — this will take time' },
  { pattern: /git\s+reset\s+--hard/, reason: 'git reset --hard — uncommitted changes will be lost' },
  { pattern: /pnpm\s+install(?!.*--frozen)/, reason: 'pnpm install without --frozen-lockfile' },
  { pattern: /docker\s+compose\s+up/, reason: 'docker compose up — verify targeting etip services' },
];

for (const { pattern, reason } of WARN) {
  if (pattern.test(cmd)) {
    console.error(`⚠️  WARNING: ${reason}`);
  }
}

process.exit(0); // Allow
