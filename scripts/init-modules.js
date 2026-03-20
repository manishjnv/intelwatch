#!/usr/bin/env node
/**
 * ETIP v4.0 — Module Package Initializer
 * Generates package.json + tsconfig.json for all 30 workspace modules
 * Run: node scripts/init-modules.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── Module Definitions ──────────────────────────────────────────
const backendModules = [
  { name: 'api-gateway', desc: 'Fastify server, routing, middleware, health checks' },
  { name: 'auth', desc: 'Passport.js, JWT, MFA, SSO, API keys' },
  { name: 'websocket', desc: 'Socket.IO, tenant-room isolation, real-time push' },
  { name: 'ingestion', desc: 'Feed connectors: STIX, TAXII, MISP, RSS, NVD' },
  { name: 'normalization', desc: 'Zod schemas, 14-type IOC detection, SHA256 dedup' },
  { name: 'ai-enrichment', desc: 'Claude API, token budgets, caching, batch jobs' },
  { name: 'ioc-intelligence', desc: 'IOC lifecycle, pivot, bulk ops, search' },
  { name: 'threat-actor-intel', desc: 'Diamond Model profiles, attribution, clustering' },
  { name: 'malware-intel', desc: 'Family taxonomy, variant tracking, IOC extraction' },
  { name: 'vulnerability-intel', desc: 'CVE/CVSS/EPSS/KEV tracking, priority scoring' },
  { name: 'threat-graph', desc: 'Neo4j ops, inference, living risk propagation' },
  { name: 'correlation-engine', desc: 'Rule + AI pattern matching, campaign detection' },
  { name: 'threat-hunting', desc: 'Investigation workspaces, agentic hunting' },
  { name: 'digital-risk-protection', desc: 'Typosquat, dark web, credential leak alerts' },
  { name: 'reporting', desc: 'PDF/CSV/STIX export, scheduled reports' },
  { name: 'enterprise-integration', desc: '15+ connectors: Splunk, Sentinel, Jira, Slack' },
  { name: 'user-management', desc: 'RBAC/ABAC, token budgets, audit log' },
  { name: 'customization', desc: 'Feature flags, white-label branding' },
  { name: 'onboarding', desc: '8-step wizard, demo data seeding' },
  { name: 'billing', desc: 'Stripe, subscriptions, usage metering' },
  { name: 'attack-surface-management', desc: 'Asset inventory, exposure scoring' },
  { name: 'admin-ops', desc: 'Infra monitoring, token dashboards, system health' },
];

const sharedPackages = [
  { name: 'shared-types', desc: 'TypeScript interfaces + Zod schemas (STIX, domain)' },
  { name: 'shared-normalization', desc: 'IOC regex patterns (14 types), dedup logic' },
  { name: 'shared-enrichment', desc: 'Claude prompt templates, cache key builders' },
  { name: 'shared-auth', desc: 'JWT verification middleware, RBAC decorators' },
  { name: 'shared-cache', desc: 'Redis client, key patterns, TTL management' },
  { name: 'shared-audit', desc: 'Immutable audit log decorators, event emitters' },
  { name: 'shared-utils', desc: 'Date helpers, hash utilities, IP validation' },
];

// ─── Backend Module package.json ─────────────────────────────────
function createBackendPackageJson(mod) {
  return JSON.stringify({
    name: `@etip/${mod.name}`,
    version: '0.1.0',
    private: true,
    description: `ETIP v4.0 — ${mod.desc}`,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc -p tsconfig.json',
      test: 'vitest run',
      'test:watch': 'vitest',
      'test:integration': 'vitest run --config vitest.integration.config.ts',
      lint: 'eslint src/',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@etip/shared-types': 'workspace:*',
      '@etip/shared-utils': 'workspace:*',
    },
    devDependencies: {
      typescript: '^5.5.0',
      tsx: '^4.15.0',
      vitest: '^2.0.0',
    },
  }, null, 2);
}

// ─── Shared Package package.json ─────────────────────────────────
function createSharedPackageJson(pkg) {
  return JSON.stringify({
    name: `@etip/${pkg.name}`,
    version: '0.1.0',
    private: true,
    description: `ETIP v4.0 — ${pkg.desc}`,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    scripts: {
      build: 'tsc -p tsconfig.json',
      test: 'vitest run',
      'test:watch': 'vitest',
      lint: 'eslint src/',
      typecheck: 'tsc --noEmit',
    },
    devDependencies: {
      typescript: '^5.5.0',
      vitest: '^2.0.0',
    },
  }, null, 2);
}

// ─── tsconfig.json (extends base) ────────────────────────────────
function createTsConfig(relativePath) {
  return JSON.stringify({
    extends: `${relativePath}/tsconfig.base.json`,
    compilerOptions: {
      outDir: 'dist',
      rootDir: 'src',
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts'],
  }, null, 2);
}

// ─── Frontend package.json ───────────────────────────────────────
const frontendPackageJson = JSON.stringify({
  name: '@etip/frontend',
  version: '0.1.0',
  private: true,
  description: 'ETIP v4.0 — React 18 + Vite 5 SPA',
  type: 'module',
  scripts: {
    dev: 'vite --port 3002',
    build: 'tsc -b && vite build',
    preview: 'vite preview',
    test: 'vitest run',
    'test:watch': 'vitest',
    lint: 'eslint src/',
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    '@etip/shared-types': 'workspace:*',
    react: '^18.3.0',
    'react-dom': '^18.3.0',
    'react-router-dom': '^6.23.0',
    '@tanstack/react-query': '^5.45.0',
    zustand: '^4.5.0',
  },
  devDependencies: {
    '@types/react': '^18.3.0',
    '@types/react-dom': '^18.3.0',
    '@vitejs/plugin-react': '^4.3.0',
    autoprefixer: '^10.4.0',
    postcss: '^8.4.0',
    tailwindcss: '^3.4.0',
    typescript: '^5.5.0',
    vite: '^5.3.0',
    vitest: '^2.0.0',
  },
}, null, 2);

// ─── Generate All ────────────────────────────────────────────────
let count = 0;

// Backend modules
for (const mod of backendModules) {
  const dir = path.join(ROOT, 'apps', mod.name);
  fs.writeFileSync(path.join(dir, 'package.json'), createBackendPackageJson(mod));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), createTsConfig('../..'));
  count++;
}

// Frontend
const feDir = path.join(ROOT, 'apps', 'frontend');
fs.writeFileSync(path.join(feDir, 'package.json'), frontendPackageJson);
fs.writeFileSync(path.join(feDir, 'tsconfig.json'), createTsConfig('../..'));
count++;

// Shared packages
for (const pkg of sharedPackages) {
  const dir = path.join(ROOT, 'packages', pkg.name);
  fs.writeFileSync(path.join(dir, 'package.json'), createSharedPackageJson(pkg));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), createTsConfig('../..'));
  count++;
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  ETIP v4.0 — Module Packages Initialized');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  📦 Modules initialized: ${count}`);
console.log(`     Backend apps: ${backendModules.length}`);
console.log(`     Frontend:     1`);
console.log(`     Shared pkgs:  ${sharedPackages.length}`);
console.log('');
console.log('  Each module now has: package.json + tsconfig.json');
console.log('  Next: pnpm install');
console.log('═══════════════════════════════════════════════════════════');
