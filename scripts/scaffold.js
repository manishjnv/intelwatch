#!/usr/bin/env node
/**
 * ETIP v4.0 — Project Scaffold
 * Creates the complete folder structure with .gitkeep files
 * Run: node scripts/scaffold.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const dirs = [
  // ═══════════════════════════════════════════════════════════════════
  // APPS — 22 modules + frontend
  // ═══════════════════════════════════════════════════════════════════

  // 1. api-gateway — Fastify server, routing, middleware
  'apps/api-gateway/src',
  'apps/api-gateway/tests',

  // 2. auth — Passport.js, JWT, MFA, SSO
  'apps/auth/src/strategies',
  'apps/auth/src/services',
  'apps/auth/tests',

  // 3. websocket — Socket.IO, tenant-room isolation
  'apps/websocket/src',
  'apps/websocket/tests',

  // 4. ingestion — Feed connectors
  'apps/ingestion/src/connectors',
  'apps/ingestion/src/services',
  'apps/ingestion/src/workers',
  'apps/ingestion/tests',

  // 5. normalization — Zod schemas, IOC detection, dedup
  'apps/normalization/src/schemas',
  'apps/normalization/src/workers',
  'apps/normalization/tests',

  // 6. ai-enrichment — Claude API, token budgets, caching
  'apps/ai-enrichment/src/prompt-templates',
  'apps/ai-enrichment/src/workers',
  'apps/ai-enrichment/tests',

  // 7. ioc-intelligence — IOC lifecycle, pivot, bulk ops
  'apps/ioc-intelligence/src/services',
  'apps/ioc-intelligence/tests',

  // 8. threat-actor-intel — Diamond Model, profiles, clustering
  'apps/threat-actor-intel/src/services',
  'apps/threat-actor-intel/tests',

  // 9. malware-intel — Family taxonomy, variant tracking
  'apps/malware-intel/src/services',
  'apps/malware-intel/tests',

  // 10. vulnerability-intel — CVE/CVSS/EPSS/KEV
  'apps/vulnerability-intel/src/services',
  'apps/vulnerability-intel/tests',

  // 11. threat-graph — Neo4j ops, inference, risk propagation
  'apps/threat-graph/src/services',
  'apps/threat-graph/src/workers',
  'apps/threat-graph/tests',

  // 12. correlation-engine — Rule + AI pattern matching
  'apps/correlation-engine/src/services',
  'apps/correlation-engine/src/workers',
  'apps/correlation-engine/tests',

  // 13. threat-hunting — Investigation workspaces
  'apps/threat-hunting/src/services',
  'apps/threat-hunting/tests',

  // 14. digital-risk-protection — Typosquat, dark web, credential leaks
  'apps/digital-risk-protection/src/services',
  'apps/digital-risk-protection/src/workers',
  'apps/digital-risk-protection/tests',

  // 15. reporting — PDF/CSV/STIX export
  'apps/reporting/src/services',
  'apps/reporting/src/workers',
  'apps/reporting/tests',

  // 16. enterprise-integration — 15+ connectors
  'apps/enterprise-integration/src/connectors',
  'apps/enterprise-integration/src/services',
  'apps/enterprise-integration/src/workers',
  'apps/enterprise-integration/tests',

  // 17. user-management — RBAC/ABAC, audit
  'apps/user-management/src/services',
  'apps/user-management/src/middleware',
  'apps/user-management/tests',

  // 18. customization — Feature flags, white-label
  'apps/customization/src/services',
  'apps/customization/tests',

  // 19. onboarding — 8-step wizard
  'apps/onboarding/src/services',
  'apps/onboarding/tests',

  // 20. billing — Stripe, subscriptions
  'apps/billing/src/services',
  'apps/billing/tests',

  // 21. attack-surface-management — Asset inventory, exposure scoring
  'apps/attack-surface-management/src/services',
  'apps/attack-surface-management/src/workers',
  'apps/attack-surface-management/tests',

  // 22. admin-ops — Infra monitoring, token dashboards
  'apps/admin-ops/src/services',
  'apps/admin-ops/src/workers',
  'apps/admin-ops/tests',

  // Frontend — React 18 + Vite 5 SPA
  'apps/frontend/src/components',
  'apps/frontend/src/hooks',
  'apps/frontend/src/pages',
  'apps/frontend/src/services',
  'apps/frontend/src/stores',
  'apps/frontend/src/styles',
  'apps/frontend/src/utils',
  'apps/frontend/src/types',
  'apps/frontend/public',

  // ═══════════════════════════════════════════════════════════════════
  // SHARED PACKAGES
  // ═══════════════════════════════════════════════════════════════════

  'packages/shared-types/src',
  'packages/shared-normalization/src',
  'packages/shared-enrichment/src/prompts',
  'packages/shared-auth/src',
  'packages/shared-cache/src',
  'packages/shared-audit/src',
  'packages/shared-utils/src',

  // ═══════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════════

  'docker/postgres',
  'docker/redis',
  'docker/elasticsearch',
  'docker/neo4j',
  'docker/nginx',
  'docker/minio',
  'docker/prometheus',
  'docker/grafana',

  'config/nginx',

  'prisma/migrations',

  // ═══════════════════════════════════════════════════════════════════
  // CI/CD, DOCS, MODULE CARDS
  // ═══════════════════════════════════════════════════════════════════

  '.github/workflows',
  'docs',
  'module-cards',
  'scripts',
];

let created = 0;
let existed = 0;

for (const dir of dirs) {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    created++;
  } else {
    existed++;
  }

  // Write .gitkeep to every leaf directory
  const gitkeep = path.join(fullPath, '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, '');
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  ETIP v4.0 — Project Scaffold Complete');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  📁 Directories created: ${created}`);
console.log(`  📁 Already existed:     ${existed}`);
console.log(`  📄 Total .gitkeep files: ${dirs.length}`);
console.log('');
console.log('  Next: git add -A && git commit -m "chore: scaffold project structure"');
console.log('═══════════════════════════════════════════════════════════');
