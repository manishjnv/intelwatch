# SKILL: AI Enrichment Engine
**ID:** 06-ai-enrichment | **Version:** 3.0

## MANDATORY (read before implementing)
1. **00-claude-instructions** — coding rules, token efficiency, definition of done
2. **00-architecture-roadmap** — tech stack, data flow, phase you're in
3. **00-master** — project structure, error classes, API response shapes
4. **02-testing** — write tests FIRST, then implement
5. **01-docs** — update documentation AFTER implementing

## MANDATORY PIPELINE INTEGRATION
Every entity stored in this module MUST:
1. Be normalized via `shared-normalization` package FIRST
2. Be queued for AI enrichment via `shared-enrichment` package
3. Be indexed in Elasticsearch after storage
4. Have a Neo4j node created/updated (via graph-service)
5. Publish the appropriate event to the event bus
6. All values displayed as clickable EntityChip (20-ui-ux)
7. Have tooltips and inline help on all UI elements

## MODULE DESCRIPTION
Shared package (/packages/shared-enrichment). Called after normalization for every entity. Providers: VirusTotal, AbuseIPDB, Shodan, IPInfo, URLScan, MalwareBazaar, NVD/EPSS. Claude AI model configurable per-tenant (see skill 22-admin-platform). TTL-based Redis cache per IOC type (hash=7d, domain=24h, ip=1h). Async via BullMQ enrichment queue. Weighted scoring model: VT 35% + AbuseIPDB 30% + AI 35%. Claude prompt is entity-type-specific. Enrichment output stored as JSONB on entity record. Token usage tracked per call for admin dashboard.

## FILE STRUCTURE (max 400 lines per file)
```
/apps/06-ai-enrichment-service/src/
  index.ts              # Fastify app setup, plugins, routes registration
  routes.ts             # Route definitions only (import controllers)
  controller.ts         # HTTP layer — parse request, call service, format response
  service.ts            # Business logic (split into multiple files if >400 lines)
  schema.ts             # Zod schemas for this module's entities
  repository.ts         # Database queries (Prisma)
  queue.ts              # BullMQ worker/producer for this module
  README.md             # Module overview (updated after each build)
```

## UI REQUIREMENTS (from 20-ui-ux)
- All entity values (IPs, domains, actor names, CVEs, hashes) = EntityChip (clickable, highlighted)
- InvestigationPanel opens on entity click (relationship sidebar)
- Page-specific compact stats bar at top of module view
- All form fields have InlineHelp messages
- All features have TooltipHelp icons
- Collapsible sections on detail views
- 3D card effect (IntelCard) on interactive cards
- Mobile responsive (375px card view, desktop table view)
- Skeleton screens on all loading states
- Empty state with actionable CTA

## TESTING REQUIREMENTS (from 02-testing)
- Write test outlines BEFORE implementing
- Unit tests: all service methods (happy + error paths)
- Integration tests: all CRUD endpoints, auth enforcement, tenant isolation
- Minimum 80% coverage
- Run `npm run test:coverage` before marking done

## AI ENRICHMENT IMPLEMENTATION
```typescript
// Enrichment service core
async enrich(entity: CanonicalEntity): Promise<EnrichmentResult> {
  const cacheKey = `enrichment:${entity.tenantId}:${entity.type}:${entity.normalized_value}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)
  
  // Parallel external API calls
  const [vt, abuse] = await Promise.allSettled([vtProvider.lookup(entity), abuseIPDB.lookup(entity)])
  
  // AI analysis via Claude
  const ai = await claude.messages.create({
    model: tenantAIConfig.models.enrichment,  // from admin config (skill 22)
    max_tokens: tenantAIConfig.enrichmentSettings.maxTokensPerEnrichment,
    system: buildSystemPrompt(entity.type),
    messages: [{ role: 'user', content: buildEnrichmentPrompt(entity, vt, abuse) }]
  })
  
  const result = computeEnrichmentResult(entity, vt, abuse, ai)
  await redis.setex(cacheKey, CACHE_TTL.enrichment[entity.type], JSON.stringify(result))
  await trackAIUsage({ tenantId, model, inputTokens: ai.usage.input_tokens, ... })  // skill 22
  return result
}
```

## AI SYSTEM PROMPT (per entity type)
```typescript
const SYSTEM_PROMPTS = {
  ip: 'You are a senior threat intelligence analyst specializing in network infrastructure. Analyze this IP indicator with provided reputation data and return JSON: { summary, severity, threatCategory, malwareFamilies, threatActors, mitreAttack, confidenceScore, isFalsePositive, falsePositiveReason, recommendedActions }. Return ONLY valid JSON.',
  domain: 'You are a threat intelligence analyst specializing in malicious domains...',
  sha256: 'You are a malware analyst specializing in file-based threats...',
  cve: 'You are a vulnerability intelligence analyst...',
}
```

---

## STRATEGIC REVIEW — P1 ADDITIONS (Update 3: Batch API + Prompt Caching + Output Schema + Budget Enforcement)
**Added:** 2026-03-16 | **Source:** Strategic Architecture Review v1.0

### ENRICHMENT OUTPUT SCHEMA (Enforced via Zod)

Every AI enrichment call MUST return data conforming to this schema. Validate with Zod before persistence.
Target: `packages/shared-enrichment/src/schemas/enrichment-output.schema.ts`

```typescript
import { z } from 'zod'

export const EnrichmentOutputSchema = z.object({
  risk_score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  threat_categories: z.array(z.string()),           // e.g. ['c2', 'phishing', 'malware-distribution']
  attributed_actors: z.array(z.string()),            // e.g. ['APT28', 'Lazarus Group']
  malware_families: z.array(z.string()),             // e.g. ['Emotet', 'Cobalt Strike']
  mitre_techniques: z.array(z.string()),             // e.g. ['T1059.001', 'T1071.001']
  reasoning: z.object({
    score_justification: z.string().max(500),         // 2-3 sentences citing specific evidence
    evidence_sources: z.array(z.string()),            // ['MITRE T1059.001', 'APT28 infrastructure overlap']
    uncertainty_factors: z.array(z.string()),         // ['Limited historical data', 'Shared hosting']
  }),
  recommended_actions: z.array(z.string()),          // ['Block at firewall', 'Monitor related domains']
  stix_labels: z.array(z.string()),                  // STIX 2.1 indicator labels
  is_false_positive: z.boolean(),
  false_positive_reason: z.string().nullable(),
})

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>
```

### REAL-TIME SINGLE ENRICHMENT (with Prompt Caching)

Pattern: Redis cache check first → parallel external APIs → Claude with prompt caching → store.

```typescript
// Real-time enrichment with prompt caching for 90% input token savings
async function enrichSingle(entity: CanonicalEntity, tenantId: string): Promise<EnrichmentOutput> {
  // Step 1: Redis cache check
  const cacheKey = `enrichment:${entity.type}:${entity.normalized_value}`
  const cached = await redis.get(cacheKey)
  if (cached) return EnrichmentOutputSchema.parse(JSON.parse(cached))

  // Step 2: Budget enforcement BEFORE API call
  const budget = await checkTokenBudget(tenantId, 'enrichment')
  if (!budget.allowed) {
    if (budget.fallbackToHaiku) {
      return enrichWithHaiku(entity, tenantId)  // Cheaper fallback
    }
    throw new AppError('TOKEN_BUDGET_EXCEEDED', 429, 'Monthly AI token budget exhausted')
  }

  // Step 3: Parallel external API calls (zero LLM cost)
  const [vtResult, abuseResult, shodanResult] = await Promise.allSettled([
    vtProvider.lookup(entity),
    abuseIPDB.lookup(entity),
    shodanProvider.lookup(entity),
  ])

  // Step 4: Claude API call WITH prompt caching
  const aiResult = await anthropic.messages.create({
    model: MODELS.default,  // claude-sonnet-4-20250514
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPTS[entity.type],
        cache_control: { type: 'ephemeral' },  // Cache system prompt (90% savings)
      },
      {
        type: 'text',
        text: MITRE_ATTACK_CORPUS,              // 200K+ tokens, cached across calls
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{
      role: 'user',
      content: buildEnrichmentPrompt(entity, vtResult, abuseResult, shodanResult),
    }],
  })

  // Step 5: Parse + validate output against schema
  const parsed = JSON.parse(extractJsonFromResponse(aiResult.content[0].text))
  const validated = EnrichmentOutputSchema.parse(parsed)

  // Step 6: Cache result with type-specific TTL
  await redis.setex(cacheKey, CACHE_TTL.enrichment[entity.type], JSON.stringify(validated))

  // Step 7: Track token usage for admin dashboard
  await trackTokenUsage({
    tenantId,
    module: 'enrichment',
    model: 'sonnet',
    inputTokens: aiResult.usage.input_tokens,
    outputTokens: aiResult.usage.output_tokens,
    cacheReadTokens: aiResult.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: aiResult.usage.cache_creation_input_tokens ?? 0,
  })

  return validated
}
```

### BATCH ENRICHMENT (50% Cost Savings via Anthropic Batch API)

For non-real-time enrichment of 10+ items. Uses Anthropic Batch API for 50% cost reduction.
Minimum batch size: 10 items (configurable via `TI_CLAUDE_BATCH_MIN_SIZE`).

```typescript
// Batch enrichment — queue 10+ items, submit to Batch API, poll for completion
async function enrichBatch(entities: CanonicalEntity[], tenantId: string): Promise<string> {
  if (entities.length < Number(process.env.TI_CLAUDE_BATCH_MIN_SIZE ?? 10)) {
    throw new AppError('BATCH_TOO_SMALL', 400, `Batch requires minimum ${TI_CLAUDE_BATCH_MIN_SIZE} items`)
  }

  // Step 1: Budget enforcement for entire batch
  const estimatedTokens = entities.length * 2000  // ~2K tokens per enrichment
  const budget = await checkTokenBudget(tenantId, 'enrichment', estimatedTokens)
  if (!budget.allowed) {
    throw new AppError('TOKEN_BUDGET_EXCEEDED', 429, 'Insufficient budget for batch')
  }

  // Step 2: Build batch request array
  const requests = entities.map((entity, idx) => ({
    custom_id: `enrich-${entity.type}-${entity.normalized_value}-${idx}`,
    params: {
      model: MODELS.default,
      max_tokens: 1024,
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPTS[entity.type],
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [{
        role: 'user' as const,
        content: buildEnrichmentPrompt(entity),
      }],
    },
  }))

  // Step 3: Submit batch to Anthropic Batch API
  const batch = await anthropic.batches.create({ requests })

  // Step 4: Store batch ID for polling worker
  await redis.setex(`batch:${batch.id}`, 86400, JSON.stringify({
    tenantId,
    entityCount: entities.length,
    entityIds: entities.map(e => e.id),
    submittedAt: new Date().toISOString(),
  }))

  // Step 5: Enqueue polling job (BullMQ)
  await enrichmentQueue.add('batch-poll', {
    batchId: batch.id,
    tenantId,
  }, {
    delay: 60_000,       // First check after 1 minute
    attempts: 60,        // Poll up to 60 times
    backoff: { type: 'fixed', delay: 60_000 },
  })

  return batch.id
}

// Batch completion worker — processes results when batch finishes
async function processBatchResults(batchId: string): Promise<void> {
  const batch = await anthropic.batches.retrieve(batchId)
  if (batch.processing_status !== 'ended') {
    throw new Error('Batch still processing')  // Will retry via BullMQ
  }

  const meta = JSON.parse(await redis.get(`batch:${batchId}`) ?? '{}')

  for await (const result of await anthropic.batches.results(batchId)) {
    if (result.result.type === 'succeeded') {
      const parsed = JSON.parse(extractJsonFromResponse(result.result.message.content[0].text))
      const validated = EnrichmentOutputSchema.parse(parsed)
      // Store enrichment result on entity record
      await entityRepository.updateEnrichment(result.custom_id, validated, meta.tenantId)
    } else {
      logger.warn({ batchId, customId: result.custom_id, error: result.result }, 'Batch item failed')
    }
  }

  // Track total batch token usage
  await trackTokenUsage({
    tenantId: meta.tenantId,
    module: 'enrichment',
    model: 'batch',
    inputTokens: batch.request_counts.succeeded * 1500,   // Estimate
    outputTokens: batch.request_counts.succeeded * 500,
  })
}
```

### TOKEN BUDGET ENFORCEMENT

Every AI API call MUST check the token budget BEFORE executing. This prevents cost overruns.

```typescript
// Token budget enforcement — called before every Claude API call
interface BudgetCheckResult {
  allowed: boolean
  remainingTokens: number
  usedPercentage: number
  fallbackToHaiku: boolean   // True when at 90-100% of budget
}

async function checkTokenBudget(
  tenantId: string,
  module: 'enrichment' | 'correlation' | 'hunting',
  estimatedTokens: number = 2000,
): Promise<BudgetCheckResult> {
  const budgetKey = `budget:${tenantId}:${module}:${getCurrentMonth()}`
  const used = Number(await redis.get(budgetKey) ?? 0)
  const limit = await getTenantTokenLimit(tenantId, module)
  const remaining = limit - used
  const usedPct = (used / limit) * 100

  // Alert at 80% threshold
  if (usedPct >= 80 && usedPct < 90) {
    await publishEvent('admin.budget.warning', { tenantId, module, usedPct })
  }

  // Fallback to Haiku at 90%
  if (usedPct >= 90 && usedPct < 100) {
    return { allowed: true, remainingTokens: remaining, usedPercentage: usedPct, fallbackToHaiku: true }
  }

  // Hard stop at 100%
  if (remaining < estimatedTokens) {
    await publishEvent('admin.budget.exceeded', { tenantId, module, usedPct })
    return { allowed: false, remainingTokens: remaining, usedPercentage: usedPct, fallbackToHaiku: false }
  }

  return { allowed: true, remainingTokens: remaining, usedPercentage: usedPct, fallbackToHaiku: false }
}

// Default per-module monthly token limits (configurable per tenant)
const DEFAULT_TOKEN_LIMITS: Record<string, number> = {
  enrichment:  500_000,   // 500K tokens/month
  correlation: 200_000,   // 200K tokens/month
  hunting:     100_000,   // 100K tokens/month
}
```

### PROMPT CACHING STRATEGY

Target: 80%+ cache hit rate on system prompts + MITRE ATT&CK corpus.

| Cached Content | Size (tokens) | Cache TTL | Savings |
|---|---|---|---|
| System prompt per entity type | ~500 | 5 min (ephemeral) | 90% input token cost |
| MITRE ATT&CK technique corpus | ~200K | 5 min (ephemeral) | 90% input token cost |
| Common enrichment patterns | ~1K | 5 min (ephemeral) | 90% input token cost |

Prompt caching is set via `cache_control: { type: 'ephemeral' }` on system message blocks.
Monitor cache hit rate via `aiResult.usage.cache_read_input_tokens` in the response.
Alert admin if cache hit rate drops below 70%.
