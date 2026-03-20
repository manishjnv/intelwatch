# SKILL: Testing & Quality Assurance
**ID:** 02-testing | **Version:** 3.0
**Run BEFORE and AFTER every implementation.**

---

## TESTING PHILOSOPHY: TEST-FIRST

```
1. Read skill → 2. Write test stubs → 3. Implement → 4. Tests pass → 5. Docs updated → ✅ DONE
                 ↑ ALWAYS start here
```

Never write implementation code before writing test outlines. This prevents hallucination and scope creep.

---

## TEST PYRAMID

```
           ┌──────────────────┐
           │   E2E (Playwright)│ ← 5% — critical journeys only
           └────────┬─────────┘
         ┌──────────┴──────────┐
         │ Integration (Supertest)│ ← 25% — all API contracts
         └─────────┬────────────┘
       ┌───────────┴────────────┐
       │   Unit (Vitest)         │ ← 70% — all business logic
       └────────────────────────┘
```

---

## PRE-BUILD CHECKLIST (Run BEFORE writing implementation)

```bash
# Before starting any feature:
npm run test:existing        # All existing tests still pass
npm run type-check           # No TypeScript errors introduced
npm run lint                 # No new lint errors
# Then: write your test stubs FIRST
```

---

## TOOLS

| Type | Tool | Config |
|---|---|---|
| Unit + Integration | Vitest | `vitest.config.ts` |
| API Integration | Supertest | `tests/integration/` |
| E2E | Playwright | `playwright.config.ts` |
| Coverage | V8 provider | >80% required |
| Load | k6 | `tests/load/` |
| Type check | TypeScript strict | `tsconfig.json` |
| Lint | ESLint + Prettier | `.eslintrc.ts` |
| Security | npm audit + Snyk | GitHub Actions |
| Snapshot | Vitest snapshots | for API response shapes |

---

## UNIT TEST PATTERNS

```typescript
// ✅ Pattern: Test normalization service
describe('NormalizationService.normalizeIOC', () => {
  const service = new NormalizationService()
  const feedMeta = { id: 'feed-1', name: 'TestFeed', tenantId: 'tenant-1' }

  it('detects SHA256 hash type automatically', async () => {
    const result = await service.normalizeIOC({ value: 'a'.repeat(64) }, feedMeta)
    expect(result.type).toBe('sha256')
  })

  it('normalizes domain to lowercase, strips trailing dot', async () => {
    const result = await service.normalizeIOC({ value: 'EVIL.COM.' }, feedMeta)
    expect(result.normalized_value).toBe('evil.com')
  })

  it('assigns AMBER TLP as default when not provided', async () => {
    const result = await service.normalizeIOC({ value: '1.2.3.4' }, feedMeta)
    expect(result.tlp).toBe('AMBER')
  })

  it('merges IOC from second feed instead of duplicating', async () => {
    await service.normalizeAndStore({ value: '1.2.3.4' }, feedMeta)
    await service.normalizeAndStore({ value: '1.2.3.4' }, { ...feedMeta, id: 'feed-2' })
    const count = await prisma.ioc.count({ where: { normalizedValue: '1.2.3.4' } })
    expect(count).toBe(1)
  })
})
```

```typescript
// ✅ Pattern: Test AI enrichment with mocks
describe('EnrichmentService.enrich', () => {
  beforeEach(() => {
    vi.mocked(virusTotalProvider.lookup).mockResolvedValue({ maliciousCount: 20, totalEngines: 70 })
    vi.mocked(claudeClient.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ severity: 'HIGH', confidenceScore: 80, summary: 'Known malicious IP' }) }]
    })
  })

  it('computes HIGH severity for IP with 20/70 VT detections', async () => {
    const result = await enrichmentService.enrich(canonicalIP)
    expect(result.severity).toBe('HIGH')
  })

  it('uses cached result on second call within TTL', async () => {
    await enrichmentService.enrich(canonicalIP)
    await enrichmentService.enrich(canonicalIP)
    expect(virusTotalProvider.lookup).toHaveBeenCalledTimes(1)
  })

  it('falls back gracefully when VT API fails', async () => {
    vi.mocked(virusTotalProvider.lookup).mockRejectedValue(new Error('API timeout'))
    const result = await enrichmentService.enrich(canonicalIP)
    expect(result).toBeDefined()
    expect(result.severity).toBeDefined()  // falls back to AI-only scoring
  })
})
```

---

## INTEGRATION TEST PATTERNS

```typescript
// ✅ Pattern: Full API endpoint test
describe('IOC API', () => {
  describe('POST /api/v1/ioc', () => {
    it('201 — creates IOC, triggers enrichment pipeline', async () => {
      const res = await request(app)
        .post('/api/v1/ioc')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ type: 'ip', value: '185.220.101.34', tlp: 'AMBER' })
      
      expect(res.status).toBe(201)
      expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(res.body.data.normalized_value).toBe('185.220.101.34')
      
      // Verify enrichment job was queued
      const jobs = await enrichmentQueue.getJobs(['waiting'])
      expect(jobs.some(j => j.data.entityId === res.body.data.id)).toBe(true)
    })

    it('400 — rejects invalid IP format', async () => {
      const res = await request(app)
        .post('/api/v1/ioc')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ type: 'ip', value: 'not-an-ip' })
      
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('401 — rejects missing auth token', async () => {
      const res = await request(app).post('/api/v1/ioc').send({ type: 'ip', value: '1.2.3.4' })
      expect(res.status).toBe(401)
    })

    it('403 — viewer role cannot create IOC', async () => {
      const res = await request(app)
        .post('/api/v1/ioc')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ type: 'ip', value: '1.2.3.4' })
      expect(res.status).toBe(403)
    })

    it('tenant isolation — tenant A cannot read tenant B IOC', async () => {
      const createRes = await request(app)
        .post('/api/v1/ioc')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ type: 'ip', value: '9.9.9.9' })
      
      const readRes = await request(app)
        .get(`/api/v1/ioc/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${tenantBToken}`)
      
      expect(readRes.status).toBe(404)
    })
  })
})
```

---

## E2E TEST PATTERNS (Playwright)

```typescript
// ✅ Pattern: Critical user journey
test.describe('Onboarding wizard', () => {
  test('new customer completes full onboarding in <10 minutes', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Email').fill('analyst@acmecorp.com')
    await page.getByLabel('Password').fill('Secure!Password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    
    // Onboarding wizard starts
    await expect(page.getByText('Welcome to ETIP')).toBeVisible({ timeout: 5000 })
    
    // Complete survey step
    await page.getByLabel('Organization name').fill('ACME Corp')
    await page.getByLabel('SOC Operations').check()
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Activate feeds step
    await page.getByRole('button', { name: 'Activate AlienVault OTX' }).click()
    await expect(page.getByText('Active')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Reach launch screen
    await expect(page.getByText("You're all set!")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('indicators')).toBeVisible()  // Demo data seeded
  })
})
```

---

## LOAD TEST (k6)

```javascript
// tests/load/ioc-search.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // ramp to 100 users
    { duration: '5m', target: 100 },   // hold
    { duration: '2m', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'],     // <1% error rate
  }
}

export default function () {
  const res = http.get('https://api.etip.io/api/v1/ioc?page=1&limit=50', {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` }
  })
  check(res, { 'status is 200': (r) => r.status === 200 })
  sleep(1)
}
```

---

## MODULE-SPECIFIC TEST CHECKLIST

After implementing any module, verify:

### Unit Tests ✅
- [ ] Service methods: all happy paths
- [ ] Service methods: all error paths (invalid input, DB failure, API timeout)
- [ ] Normalization: all entity types, edge cases
- [ ] Enrichment: mocked external APIs, caching, fallback
- [ ] RBAC: all roles tested for each endpoint
- [ ] Tenant isolation: cross-tenant access returns 404
- [ ] Coverage report shows >80%

### Integration Tests ✅
- [ ] All CRUD endpoints (201, 200, 204, 400, 401, 403, 404)
- [ ] Pagination (page, limit, total, boundary conditions)
- [ ] Filtering (all filter params work correctly)
- [ ] Sorting (all sortable fields)
- [ ] Queue jobs are enqueued after create
- [ ] Enrichment is applied after queue is processed

### E2E Tests ✅
- [ ] Primary user journey through module works end-to-end
- [ ] Entity names/values are clickable (opens detail)
- [ ] Tooltips appear on hover
- [ ] Mobile viewport (375px) renders correctly
- [ ] Stats bars show correct data

### Pre-Deploy Gate ✅
- [ ] `npm run lint` → 0 errors
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run test:coverage` → all pass, >80%
- [ ] `npm audit --audit-level=high` → 0 critical
- [ ] Docker build succeeds
- [ ] Health check endpoint responds 200

---

## CI/CD TEST PIPELINE

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env: { POSTGRES_DB: etip_test, POSTGRES_PASSWORD: test }
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test:coverage
        env: { DATABASE_URL: postgresql://postgres:test@localhost/etip_test }
      - run: npm audit --audit-level=high
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
```
