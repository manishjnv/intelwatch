# SKILL: Admin Platform Module
**ID:** 22-admin-platform | **Version:** 3.0
**Scope:** Super-admin + tenant admin — infrastructure monitoring, AI config, system health, platform management

---

## PURPOSE
A comprehensive administration layer giving platform operators and tenant admins full visibility into system health, resource usage, AI model configuration, user activity, and platform governance — all in one place.

---

## ADMIN PANEL STRUCTURE

```
/admin
  /dashboard          → System overview (health, usage, errors, revenue)
  /infrastructure     → Infra monitoring (CPU, memory, DB, queue health)
  /ai-config          → AI model selection, token budgets, cost tracking
  /tenants            → Tenant management (create, suspend, configure)
  /users              → Global user directory + impersonation (super-admin)
  /feeds              → Global feed library + activation per tenant
  /integrations       → Platform-level integration templates
  /billing            → Revenue dashboard, subscription management
  /audit-log          → Global audit trail (all tenants, all actions)
  /feature-flags      → Global feature toggles (across all tenants)
  /announcements      → In-app announcements + maintenance banners
  /api-keys           → Platform API key management
  /security           → IP whitelist, failed logins, threat alerts
  /performance        → Query performance, slow queries, cache hit rates
```

---

## INFRASTRUCTURE MONITORING

### Metrics Collected (via Prometheus)

```typescript
export const MONITORED_METRICS = {
  system: ['cpu_usage_percent', 'memory_used_mb', 'disk_used_percent', 'network_rx_bytes', 'network_tx_bytes'],
  services: ['service_up', 'request_count', 'request_duration_p95', 'error_rate', 'active_connections'],
  databases: ['postgres_connections', 'postgres_query_duration', 'postgres_deadlocks', 'redis_memory_used', 'redis_hit_rate', 'es_index_size', 'neo4j_active_transactions'],
  queues: ['bullmq_waiting_jobs', 'bullmq_active_jobs', 'bullmq_failed_jobs', 'bullmq_completed_jobs', 'enrichment_queue_lag'],
  platform: ['ioc_ingestion_rate', 'enrichment_success_rate', 'active_feeds', 'active_tenants', 'api_requests_total']
}
```

### Infra Dashboard API
```typescript
router.get('/api/v1/admin/infrastructure/health', rbac('super_admin'), async (req, res) => {
  const health = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkElasticsearch(),
    checkNeo4j(),
    checkQueues(),
    checkDiskSpace(),
    checkMemory(),
    checkCPU()
  ])
  
  const overall = health.every(h => h.status === 'healthy') ? 'healthy' 
                : health.some(h => h.status === 'critical') ? 'critical' : 'degraded'
  
  res.json({ overall, services: health, timestamp: new Date().toISOString() })
})

router.get('/api/v1/admin/infrastructure/metrics', rbac('super_admin'), async (req, res) => {
  const { from, to, resolution } = req.query
  const metrics = await prometheusClient.query({ from, to, resolution })
  res.json(metrics)
})
```

### Real-Time Alerts
```typescript
// Alert on infrastructure anomalies
const ALERT_THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 75, critical: 90 },
  disk: { warning: 80, critical: 95 },
  queueLag: { warning: 1000, critical: 5000 },   // jobs waiting
  errorRate: { warning: 0.01, critical: 0.05 },  // 1% / 5%
  responseTime_p95: { warning: 500, critical: 2000 }  // ms
}
```

---

## AI MODEL CONFIGURATION (Per Tenant + Global)

```typescript
export const AIModelConfig = z.object({
  tenantId: z.string().optional(),  // null = global default
  
  // Model selection per use case
  models: z.object({
    enrichment:   z.enum(['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-opus-4-6']).default('claude-sonnet-4-20250514'),
    correlation:  z.enum(['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-opus-4-6']).default('claude-sonnet-4-20250514'),
    hunting:      z.enum(['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-opus-4-6']).default('claude-sonnet-4-20250514'),
    summarization: z.enum(['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514']).default('claude-haiku-4-5-20251001'),
    iocExtraction: z.enum(['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514']).default('claude-sonnet-4-20250514'),
  }),
  
  // Token budgets (daily limits per use case)
  tokenBudgets: z.object({
    enrichmentPerDay:   z.number().min(0).default(500_000),
    correlationPerDay:  z.number().min(0).default(200_000),
    huntingPerDay:      z.number().min(0).default(100_000),
    totalPerDay:        z.number().min(0).default(1_000_000),
  }),
  
  // Cost controls
  costControls: z.object({
    dailyBudgetUSD:      z.number().optional(),
    alertAtPercent:      z.number().min(0).max(100).default(80),
    hardStopAtBudget:    z.boolean().default(false),
    fallbackToHaiku:     z.boolean().default(true),  // Use Haiku when budget reached
  }),
  
  // Enrichment settings
  enrichmentSettings: z.object({
    maxTokensPerEnrichment: z.number().min(100).max(4096).default(1024),
    temperature:            z.number().min(0).max(1).default(0.1),
    enabledForTypes:        z.array(z.string()).default(['ip', 'domain', 'sha256', 'cve']),
    skipEnrichmentBelow:    z.number().min(0).max(100).default(0),  // min confidence to enrich
  })
})

// Admin API
router.get('/api/v1/admin/ai-config', rbac('admin'), getAIConfig)
router.put('/api/v1/admin/ai-config', rbac('admin'), updateAIConfig)
router.get('/api/v1/admin/ai-usage', rbac('admin'), getAIUsage)
router.get('/api/v1/admin/ai-cost', rbac('admin'), getAICost)
```

### AI Usage Tracking
```typescript
// Track every AI call for cost visibility
export async function trackAIUsage(params: {
  tenantId: string
  useCase: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  success: boolean
}): Promise<void> {
  await db.aiUsageLog.create({ data: { ...params, timestamp: new Date() } })
  
  // Update rolling daily counter in Redis
  const key = `ai:usage:${params.tenantId}:${today()}`
  await redis.incrby(key, params.inputTokens + params.outputTokens)
  await redis.expire(key, 86400 * 7)  // keep 7 days of daily totals
}

// Usage dashboard data
router.get('/api/v1/admin/ai-usage/summary', rbac('admin'), async (req, res) => {
  const { days = 30 } = req.query
  res.json({
    totalTokens: await getTotalTokens(req.user.tenantId, days),
    byModel: await getTokensByModel(req.user.tenantId, days),
    byUseCase: await getTokensByUseCase(req.user.tenantId, days),
    estimatedCostUSD: await estimateCost(req.user.tenantId, days),
    dailyTrend: await getDailyTrend(req.user.tenantId, days),
    budgetUtilization: await getBudgetUtilization(req.user.tenantId)
  })
})
```

---

## AUTHENTICATION — ADMIN SPECIAL METHODS

### Google SSO for Admin Login
```typescript
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

passport.use('google-admin', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: `${BASE_URL}/api/v1/auth/google/callback`,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  const email = profile.emails?.[0]?.value
  if (!email) return done(null, false)
  
  // Check if email domain is in allowed admin domains
  const allowedDomains = process.env.ADMIN_ALLOWED_DOMAINS?.split(',') ?? []
  if (!allowedDomains.some(d => email.endsWith(d))) {
    return done(null, false, { message: 'Domain not authorized for admin access' })
  }
  
  const user = await upsertAdminUser({ email, name: profile.displayName, googleId: profile.id })
  return done(null, user)
}))

router.get('/api/v1/auth/google', passport.authenticate('google-admin'))
router.get('/api/v1/auth/google/callback', passport.authenticate('google-admin', {
  successRedirect: '/admin/dashboard',
  failureRedirect: '/login?error=google_auth_failed'
}))
```

### Magic Code Login for Admin (No password needed)
```typescript
// Admin requests a 6-digit OTP sent to their verified email
router.post('/api/v1/auth/admin/request-code', async (req, res) => {
  const { email } = req.body
  const admin = await getAdminByEmail(email)
  if (!admin) return res.json({ success: true })  // don't reveal if email exists
  
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  await redis.setex(`admin_code:${email}`, 300, await bcrypt.hash(code, 10))  // 5 min TTL
  
  await sendEmail({ to: email, subject: 'ETIP Admin Login Code', body: `Your code: ${code} (expires in 5 minutes)` })
  res.json({ success: true })
})

router.post('/api/v1/auth/admin/verify-code', async (req, res) => {
  const { email, code } = req.body
  const stored = await redis.get(`admin_code:${email}`)
  if (!stored || !(await bcrypt.compare(code, stored))) {
    return res.status(401).json({ error: { code: 'INVALID_CODE', message: 'Invalid or expired code' } })
  }
  await redis.del(`admin_code:${email}`)
  const admin = await getAdminByEmail(email)
  const tokens = tokenService.generateTokenPair(admin)
  res.json({ ...tokens, user: admin })
})
```

### Customer SSO (SAML/OIDC via Tenant Config)
```typescript
// Each tenant can configure their own SSO — only approved users get access
router.post('/api/v1/auth/sso/configure', rbac('admin'), async (req, res) => {
  const config = SSOConfig.parse(req.body)
  // Validate certificate, test connection before saving
  await validateSSOConfig(config)
  await db.ssoConfig.upsert({ where: { tenantId: req.user.tenantId }, create: config, update: config })
  res.json({ success: true })
})

// Approved users list — only listed emails can SSO into this tenant
router.post('/api/v1/auth/sso/approved-users', rbac('admin'), manageApprovedSSOUsers)
```

---

## TENANT MANAGEMENT (Super Admin)

```typescript
router.get('/api/v1/admin/tenants', rbac('super_admin'), listAllTenants)
router.post('/api/v1/admin/tenants', rbac('super_admin'), createTenant)
router.put('/api/v1/admin/tenants/:id/suspend', rbac('super_admin'), suspendTenant)
router.put('/api/v1/admin/tenants/:id/plan', rbac('super_admin'), changeTenantPlan)
router.post('/api/v1/admin/tenants/:id/impersonate', rbac('super_admin'), impersonateTenant)
router.get('/api/v1/admin/tenants/:id/usage', rbac('super_admin'), getTenantUsage)
```

---

## PLATFORM ANNOUNCEMENTS
```typescript
// Admins can push in-app banners to all users or specific tenants
export const Announcement = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  type: z.enum(['info', 'warning', 'maintenance', 'feature']),
  targetTenants: z.array(z.string()).default([]),  // empty = all tenants
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  dismissible: z.boolean().default(true),
  link: z.string().url().optional()
})

router.post('/api/v1/admin/announcements', rbac('super_admin'), createAnnouncement)
router.get('/api/v1/announcements/active', getActiveAnnouncements)  // called by frontend on load
```

---

## SECURITY MONITORING
```typescript
router.get('/api/v1/admin/security/failed-logins', rbac('admin'), getFailedLogins)
router.get('/api/v1/admin/security/suspicious-activity', rbac('admin'), getSuspiciousActivity)
router.get('/api/v1/admin/security/active-sessions', rbac('admin'), getActiveSessions)
router.delete('/api/v1/admin/security/sessions/:userId', rbac('admin'), revokeUserSessions)
```

---

## FRONTEND: ADMIN DASHBOARD UI

```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 ETIP Admin                              [Super Admin] [?] │
├──────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │
│ │ Health │ │Tenants │ │AI Cost │ │  IOCs  │ │ Queue Lag  │ │
│ │  ✅    │ │  142   │ │ $24.5  │ │ 1.2M   │ │    12 jobs │ │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘ │
├──────────────────────────────────────────────────────────────┤
│         Infrastructure Health            AI Usage (30d)       │
│  ████████████ CPU 34%                   [chart]               │
│  ████████████ MEM 58%                                         │
│  ████████████ DISK 42%                                        │
│  Postgres ✅  Redis ✅  ES ✅  Neo4j ✅                       │
└──────────────────────────────────────────────────────────────┘
```

---

## TESTING
```typescript
describe('Admin Platform', () => {
  it('returns 200 health check when all services up', async () => {
    mockAllServicesHealthy()
    const res = await request(app).get('/api/v1/admin/infrastructure/health').set('Authorization', `Bearer ${superAdminToken}`)
    expect(res.body.overall).toBe('healthy')
  })

  it('admin code login — valid code works once then expires', async () => {
    await request(app).post('/api/v1/auth/admin/request-code').send({ email: 'admin@etip.io' })
    const code = await getLastEmailCode()
    const res1 = await request(app).post('/api/v1/auth/admin/verify-code').send({ email: 'admin@etip.io', code })
    expect(res1.body.accessToken).toBeDefined()
    const res2 = await request(app).post('/api/v1/auth/admin/verify-code').send({ email: 'admin@etip.io', code })
    expect(res2.status).toBe(401)  // used once already
  })

  it('AI usage is tracked per call', async () => {
    await enrichmentService.enrich(canonicalIP)
    const usage = await db.aiUsageLog.findFirst({ where: { tenantId } })
    expect(usage?.inputTokens).toBeGreaterThan(0)
    expect(usage?.model).toBe('claude-sonnet-4-20250514')
  })
})
```
