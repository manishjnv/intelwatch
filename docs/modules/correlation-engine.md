# Correlation Engine (Module 13)

**Port:** 3013 | **Status:** ✅ Deployed (15/15 improvements + P1-1 persistence) | **Tests:** 179 | **Session:** 65

## Features

| # | Feature | File | Description |
|---|---------|------|-------------|
| 1 | IOC Co-occurrence | `src/services/cooccurrence.ts` | Sliding-window Jaccard similarity on feed source sets |
| 2 | Infrastructure Clustering | `src/services/infrastructure-cluster.ts` | ASN/CIDR/registrar overlap scoring |
| 3 | Temporal Wave Detection | `src/services/temporal-wave.ts` | Z-score anomaly detection on IOC volume spikes |
| 4 | TTP Similarity | `src/services/ttp-similarity.ts` | Sorensen-Dice coefficient on MITRE ATT&CK techniques |
| 5 | Campaign Auto-Clustering | `src/services/campaign-cluster.ts` | DBSCAN on 4D feature vectors (infra, temporal, TTP, feed) |
| 6 | Confidence Scoring | `src/services/confidence-scoring.ts` | Weighted composite: evidence × diversity × freshness × quality |
| 7 | Diamond Model | `src/services/diamond-model.ts` | Auto-map entities to adversary/capability/infrastructure/victim |
| 8 | Kill Chain Correlation | `src/services/kill-chain.ts` | MITRE tactic → Cyber Kill Chain phase mapping |
| 9 | FP Suppression | `src/services/fp-suppression.ts` | Per-rule FP rate tracking, auto-suppress at threshold |
| 10 | Relationship Inference | `src/services/relationship-inference.ts` | BFS transitive closure with confidence decay |
| 11 | AI Pattern Detection | `src/services/ai-pattern-detection.ts` | Claude Sonnet cluster analysis — identifies non-obvious cross-campaign patterns and produces human-readable explanations |
| 12 | Rule Template Library | `src/services/rule-templates.ts` | 6 pre-built templates (APT infra reuse, ransomware, C2 beacon, supply chain, phishing, lateral movement) with condition scoring |
| 13 | Confidence Decay | `src/services/confidence-decay.ts` | Per-type exponential decay with half-life derivations; JSDoc cites VT IOC aging and MISP decay model research |
| 14 | Batch Re-correlation | `src/services/batch-recorrelation.ts` | Queue-driven re-analysis of historical IOC sets; supports algorithm selection and time-window override |
| 15 | Threat-Graph Integration | `src/services/graph-integration.ts` | Publishes correlation matches as Neo4j relationships (HOSTED_ON, USES_TTP, INDICATES, RESOLVES_TO, CO_OCCURS) |
| P1-1 | Redis Pattern Persistence | `src/services/store-checkpoint.ts` | Checkpoint all 6 store Maps to Redis on write (5s debounce), restore on startup, 7-day TTL |

## API Endpoints (20)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| GET | `/ready` | None | Readiness check |
| GET | `/api/v1/correlations` | `alert:read` | List results (paginated, filterable) |
| GET | `/api/v1/correlations/stats` | `alert:read` | Stats by type/severity |
| GET | `/api/v1/correlations/:id` | `alert:read` | Single result detail |
| POST | `/api/v1/correlations/run` | `alert:create` | Trigger manual correlation |
| GET | `/api/v1/correlations/campaigns` | `alert:read` | DBSCAN campaign clusters |
| GET | `/api/v1/correlations/campaigns/:id` | `alert:read` | Campaign detail |
| GET | `/api/v1/correlations/waves` | `alert:read` | Temporal anomaly waves |
| GET | `/api/v1/correlations/diamond/:id` | `alert:read` | Diamond Model mapping |
| GET | `/api/v1/correlations/kill-chain` | `alert:read` | Kill Chain phase coverage |
| POST | `/api/v1/correlations/:id/feedback` | `alert:create` | Analyst FP/TP feedback |

## Config

| Variable | Default | Purpose |
|----------|---------|---------|
| `TI_CORRELATION_PORT` | 3013 | Service port |
| `TI_CORRELATION_WINDOW_HOURS` | 24 | Co-occurrence sliding window |
| `TI_CORRELATION_ZSCORE_THRESHOLD` | 2.0 | Temporal wave spike threshold |
| `TI_CORRELATION_DBSCAN_EPSILON` | 0.3 | DBSCAN distance threshold |
| `TI_CORRELATION_DBSCAN_MIN_PTS` | 3 | DBSCAN minimum cluster size |
| `TI_CORRELATION_FP_THRESHOLD` | 0.7 | Auto-suppress FP rate |
| `TI_CORRELATION_FP_MIN_SAMPLES` | 5 | Min feedback before suppress |
| `TI_CORRELATION_INFERENCE_DECAY` | 0.8 | Confidence decay per hop |
| `TI_CORRELATION_INFERENCE_MAX_DEPTH` | 3 | Max transitive hops |
| `TI_CORRELATION_INFERENCE_MIN_CONF` | 0.1 | Min confidence cutoff |
| `TI_CORRELATION_WORKER_CONCURRENCY` | 5 | BullMQ worker concurrency |
| `TI_CORRELATION_MAX_RESULTS` | 10000 | Max results per tenant |
| `TI_CORRELATION_CONFIDENCE_THRESHOLD` | 0.6 | Min confidence to store result |
| `TI_CORRELATION_CHECKPOINT_ENABLED` | `true` | Enable Redis pattern persistence |
| `TI_CORRELATION_CHECKPOINT_TTL_DAYS` | 7 | Days before checkpoint key expires |

## Data Flow

```
QUEUES.CORRELATE → Worker → CorrelationStore (in-memory Maps)
  → Run 10 algorithms → Filter by confidence ≥ 0.6
  → Apply FP suppression → Store results
  → scheduleCheckpoint() → Redis (debounced 5s, 7-day TTL)
  → HIGH/CRITICAL → QUEUES.ALERT_EVALUATE

Startup: StoreCheckpointService.restore() → hydrate CorrelationStore from Redis
```
