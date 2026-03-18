#!/usr/bin/env node
/**
 * SessionStart hook: Injects current project state into context.
 * Outputs JSON with additionalContext field that Claude sees at session start.
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const lines = [];

// Git state
try {
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  const lastCommit = execSync('git log --oneline -3', { encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();

  lines.push(`Git branch: ${branch}`);
  lines.push(`Recent commits:\n${lastCommit}`);
  lines.push(dirty ? `Uncommitted changes:\n${dirty}` : 'Working tree: clean');
} catch {
  lines.push('Git: not available');
}

// Project state summary
try {
  const statePath = 'docs/PROJECT_STATE.md';
  if (existsSync(statePath)) {
    const state = readFileSync(statePath, 'utf8');
    const lastUpdated = state.match(/\*\*Last updated:\*\*\s*(.+)/)?.[1] || 'unknown';
    const nextTask = state.match(/\*\*Next task:\*\*\s*(.+)/)?.[1] || 'not specified';
    const currentPhase = state.match(/\*\*Current phase:\*\*\s*(.+)/)?.[1] || 'unknown';
    lines.push(`\nProject state (last updated: ${lastUpdated}):`);
    lines.push(`Phase: ${currentPhase}`);
    lines.push(`Next task: ${nextTask}`);
    lines.push('Run /session-start for full context.');
  }
} catch {
  // Silently continue
}

// Docker status
try {
  const containers = execSync(
    'docker ps --filter name=etip_ --format "{{.Names}}: {{.Status}}" 2>/dev/null',
    { encoding: 'utf8', timeout: 5000 }
  ).trim();
  if (containers) {
    lines.push(`\nETIP containers:\n${containers}`);
  }
} catch {
  // Docker not available or not running
}

if (lines.length > 0) {
  console.log(JSON.stringify({ additionalContext: lines.join('\n') }));
}

process.exit(0);
