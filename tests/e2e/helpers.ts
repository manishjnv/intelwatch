/**
 * E2E test helpers — Redis queue depth checks and API client utilities.
 *
 * Requires running ETIP containers (Redis at E2E_REDIS_URL, API at E2E_API_BASE).
 * BullMQ key format: bull:{queueName}:{suffix}  (default prefix = "bull")
 */
import Redis from 'ioredis';

// ── Environment ────────────────────────────────────────────────────────────────

export const E2E_API_BASE   = process.env['E2E_API_BASE']   ?? 'http://localhost:3001';
export const E2E_REDIS_URL  = process.env['E2E_REDIS_URL']  ?? 'redis://localhost:6379';
export const E2E_ADMIN_EMAIL    = process.env['E2E_ADMIN_EMAIL']    ?? '';
export const E2E_ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? '';

// ── Redis helpers ───────────────────────────────────────────────────────────────

/**
 * Create an ioredis client pointed at the E2E Redis instance.
 * The caller is responsible for calling `.quit()` in afterAll.
 */
export function createRedisClient(): Redis {
  return new Redis(E2E_REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

/**
 * Read the BullMQ auto-increment job ID counter for a queue.
 * BullMQ INCREMENTs `bull:{queueName}:id` every time a new job is added.
 * Returns 0 when no jobs have ever been enqueued (key does not exist yet).
 */
export async function getJobCounter(redis: Redis, queueName: string): Promise<number> {
  const val = await redis.get(`bull:${queueName}:id`);
  return val != null ? parseInt(val, 10) : 0;
}

/**
 * Return current pending depth (waiting + active) for a queue.
 * Useful for spotting backlogs, not for "did a job ever arrive" checks
 * (use getJobCounter for that — LLEN returns 0 once jobs complete).
 */
export async function getQueueDepth(redis: Redis, queueName: string): Promise<number> {
  const [wait, active] = await Promise.all([
    redis.llen(`bull:${queueName}:wait`),
    redis.llen(`bull:${queueName}:active`),
  ]);
  return wait + active;
}

/**
 * Snapshot the job ID counter for multiple queues at once.
 * Returns a Map: queueName → counter.
 */
export async function snapshotCounters(
  redis: Redis,
  queueNames: string[],
): Promise<Map<string, number>> {
  const entries = await Promise.all(
    queueNames.map(async (q) => [q, await getJobCounter(redis, q)] as const),
  );
  return new Map(entries);
}

/**
 * Poll until the job-ID counter for `queueName` exceeds `beforeCount`.
 * Resolves when a new job is detected. Throws on timeout.
 *
 * @param pollIntervalMs  How often to check (default 2 s).
 */
export async function waitForNewJob(
  redis: Redis,
  queueName: string,
  beforeCount: number,
  timeoutMs: number,
  pollIntervalMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = await getJobCounter(redis, queueName);
    if (current > beforeCount) return;
    await sleep(pollIntervalMs);
  }

  const final = await getJobCounter(redis, queueName);
  throw new Error(
    `Queue "${queueName}" received no new jobs within ${timeoutMs / 1_000}s ` +
    `(counter stuck at ${beforeCount}, now ${final})`,
  );
}

// ── API helpers ─────────────────────────────────────────────────────────────────

/** POST /api/v1/auth/login → returns accessToken. */
export async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${E2E_API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const json = await res.json() as { data: { accessToken: string } };
  if (!json.data?.accessToken) throw new Error('Login response missing accessToken');
  return json.data.accessToken;
}

/** Generic authenticated GET. Returns parsed JSON body. */
export async function apiGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${E2E_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${body}`);
  }

  return res.json();
}

/** Generic authenticated POST. Returns parsed JSON body. */
export async function apiPost(
  token: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${E2E_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

/** Authenticated DELETE. */
export async function apiDelete(token: string, path: string): Promise<void> {
  const res = await fetch(`${E2E_API_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  // 204 No Content and 200 are both acceptable
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`DELETE ${path} failed (${res.status}): ${text}`);
  }
}

/** ms sleep */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
