#!/usr/bin/env node
/**
 * PreToolUse hook for git commit:
 *  - HARD BLOCKS commits that touch Tier 1 (frozen) modules without override
 *  - HARD BLOCKS commits with shared-* changes spanning multiple modules
 *  - WARNS on cross-module commits
 *  - WARNS on possible secrets
 *
 * Exit code 0 = allow
 * Exit code 2 = BLOCK (denied)
 */
import { execSync } from 'child_process';

// Tier 1 FROZEN paths — changes here require explicit approval
// If you INTENTIONALLY need to modify these, use:
//   git commit --no-verify -m "fix: [description] — Tier 1 approved"
const TIER1_FROZEN = [
  'packages/shared-types/',
  'packages/shared-utils/',
  'packages/shared-auth/',
  'packages/shared-cache/',
  'packages/shared-audit/',
  'packages/shared-normalization/',
  'packages/shared-enrichment/',
  'packages/shared-ui/',
  'apps/api-gateway/',
];

try {
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  if (!staged) {
    process.exit(0); // Nothing staged
  }

  const files = staged.split('\n');

  // === TIER 1 ENFORCEMENT (HARD BLOCK) ===
  const tier1Touched = [];
  for (const file of files) {
    for (const frozenPath of TIER1_FROZEN) {
      if (file.startsWith(frozenPath)) {
        tier1Touched.push({ file, module: frozenPath.replace(/\/$/, '') });
      }
    }
  }

  if (tier1Touched.length > 0) {
    // Check if OTHER (non-Tier-1) files are also in the commit
    const nonTier1Files = files.filter(f => !TIER1_FROZEN.some(p => f.startsWith(p)));
    const uniqueTier1Modules = [...new Set(tier1Touched.map(t => t.module))];

    console.error('');
    console.error('🛑 TIER 1 (FROZEN) MODULE CHANGE DETECTED');
    console.error('═══════════════════════════════════════════');
    console.error('');
    console.error('Frozen modules touched:');
    for (const mod of uniqueTier1Modules) {
      console.error(`  ❄️  ${mod}`);
    }
    console.error('');
    console.error('Files:');
    for (const { file } of tier1Touched) {
      console.error(`  - ${file}`);
    }
    console.error('');
    console.error('Tier 1 modules require:');
    console.error('  1. Backward-compatible (additive) changes only');
    console.error('  2. Impact analysis: list ALL consuming modules');
    console.error('  3. Explicit user approval in the chat');
    console.error('');

    if (nonTier1Files.length > 0) {
      // Mixed commit: Tier 1 + other modules = definitely suspicious
      console.error('⚠️  MIXED COMMIT: Also contains non-frozen files:');
      for (const f of nonTier1Files.slice(0, 10)) {
        console.error(`  - ${f}`);
      }
      if (nonTier1Files.length > 10) {
        console.error(`  ... and ${nonTier1Files.length - 10} more`);
      }
      console.error('');
    }

    console.error('ACTION: Split Tier 1 changes into a separate, reviewed commit.');
    console.error('OVERRIDE: If approved, use: git commit --no-verify');
    console.error('');
    process.exit(2); // BLOCK
  }

  // === CROSS-MODULE WARNING (soft) ===
  const modules = new Set(
    files
      .filter(f => f.startsWith('apps/') || f.startsWith('packages/'))
      .map(f => f.split('/').slice(0, 2).join('/'))
  );

  if (modules.size > 1) {
    console.error('');
    console.error(`⚠️  CROSS-MODULE COMMIT: Changes span ${modules.size} modules:`);
    for (const m of modules) console.error(`   - ${m}`);
    console.error('   Verify this is intentional and scope lock allows it.');
    console.error('');
  }

  // === SECRET DETECTION (soft) ===
  try {
    const diff = execSync('git diff --cached', { encoding: 'utf8' });
    if (/(?:password|secret|token|api[_-]?key)\s*[:=]/i.test(diff)) {
      // Exclude known safe patterns
      const lines = diff.split('\n').filter(l =>
        l.startsWith('+') &&
        /(?:password|secret|token|api[_-]?key)\s*[:=]/i.test(l) &&
        !/(\.example|\.md|process\.env|\.test\.|\.spec\.)/i.test(l)
      );
      if (lines.length > 0) {
        console.error('🛑 POSSIBLE SECRET IN DIFF:');
        for (const l of lines.slice(0, 5)) {
          console.error(`   ${l.substring(0, 120)}`);
        }
        console.error('   Review carefully before committing!');
        console.error('');
      }
    }
  } catch {
    // diff check failed, continue
  }

  console.error('📋 REMINDER: Run /pre-push before pushing to master.');
  console.error('📋 REMINDER: Check docs/DEPLOYMENT_RCA.md for known issue patterns.');

} catch {
  // If git commands fail, allow the commit
}

process.exit(0);
