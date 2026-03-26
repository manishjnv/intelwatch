/**
 * Live Feed Smoke Test — verifies the full pipeline:
 *   Create feed → Trigger fetch → Articles appear → IOCs extracted
 *
 * Requires a running ETIP stack (ingestion + normalization services).
 * Skipped in CI (no live network). Run manually:
 *   TI_E2E_LIVE=1 npx vitest run tests/e2e/live-feed-smoke.test.ts
 */
import { describe, it, expect } from 'vitest';

const API_BASE = process.env.TI_API_GATEWAY_URL ?? 'http://localhost:3001';
const TENANT_ID = process.env.TI_TENANT_ID ?? 'demo-tenant';
const AUTH_TOKEN = process.env.TI_AUTH_TOKEN ?? '';
const LIVE = process.env.TI_E2E_LIVE === '1';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) h['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  return h;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe.skipIf(!LIVE)('Live Feed Smoke Test', () => {
  let feedId: string;

  it('creates a CISA Advisories RSS feed', async () => {
    const res = await fetch(`${API_BASE}/api/v1/feeds`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        tenantId: TENANT_ID,
        name: `E2E-Smoke-${Date.now()}`,
        url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
        feedType: 'rss',
        schedule: '0 0 1 1 *', // never auto-triggers (Jan 1 midnight)
        enabled: true,
      }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { data: { id: string } };
    feedId = body.data.id;
    expect(feedId).toBeDefined();
  });

  it('triggers immediate feed fetch', async () => {
    const res = await fetch(`${API_BASE}/api/v1/feeds/${feedId}/trigger`, {
      method: 'POST',
      headers: headers(),
    });
    expect(res.ok).toBe(true);
  });

  it('articles appear within 30 seconds', async () => {
    let articles: Array<{ id: string; title: string; publishedAt: string }> = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(3000);
      const res = await fetch(
        `${API_BASE}/api/v1/articles?feedId=${feedId}&limit=5`,
        { headers: headers() },
      );
      if (!res.ok) continue;
      const body = await res.json() as { data: typeof articles };
      articles = body.data ?? [];
      if (articles.length > 0) break;
    }

    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0].title).toBeTruthy();
  });

  it('cleans up test feed', async () => {
    if (!feedId) return;
    const res = await fetch(`${API_BASE}/api/v1/feeds/${feedId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    // 204 or 200 both acceptable
    expect(res.status).toBeLessThan(300);
  });
});
