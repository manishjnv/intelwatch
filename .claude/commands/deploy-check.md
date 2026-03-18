---
description: Verify deployment health after push to master
allowed-tools: Bash(curl:*), Read
---

Post-deployment verification. Run after CI/CD completes.

## 1. Wait for CI
"Waiting 90 seconds for CI/CD pipeline to complete..."
(In practice, check GitHub Actions status)

## 2. ETIP Health
```
curl -sf https://ti.intelwatch.in/health
curl -sf https://ti.intelwatch.in/ready
```

## 3. Live Site Verification (CRITICAL)
```
curl -sf https://intelwatch.in -o /dev/null -w "%{http_code}"
```
The live site MUST still return 200. If not → IMMEDIATE ROLLBACK.

## 4. Results

```
DEPLOYMENT VERIFICATION
═══════════════════════
| Check              | Status | Response |
|--------------------|--------|----------|
| ETIP /health       | ✅/❌  |          |
| ETIP /ready        | ✅/❌  |          |
| Live site (intelwatch.in) | ✅/❌  |          |
|                    |        |          |
| VERDICT            | PASS/FAIL        |
```

If FAIL:
1. Identify which check failed
2. Check container logs: `docker logs etip_api --since=5m 2>&1 | tail -20`
3. If live site affected: EMERGENCY — notify immediately
4. If only ETIP affected: check CI logs, fix, redeploy
5. Add RCA entry to docs/DEPLOYMENT_RCA.md

If PASS:
- Update docs/PROJECT_STATE.md deployment status table
- Confirm: "Deployment verified. All systems operational."
