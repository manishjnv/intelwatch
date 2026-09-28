/**
 * @module email-queue
 * @description S172 PR2: producer side of email verification. Enqueues jobs onto
 *   `QUEUES.EMAIL_SEND` for admin-service's consumer to send. `removeOnComplete`
 *   so the plaintext token (in job data) doesn't linger in Redis after send;
 *   the token itself expires in 24h regardless.
 */
import { Queue } from 'bullmq';
import { AppError, QUEUES } from '@etip/shared-utils';

export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: { age: 86_400 },
} as const;

interface EmailJobPayload {
  queue: string;
  data: { type: string } & Record<string, unknown>;
}

let queue: Queue | null = null;
/** Lazily created so tests can mock `bullmq` before this module is used. Same pattern as search-backfill.ts. */
function getQueue(): Queue {
  if (!queue) {
    const redisUrl = process.env['TI_REDIS_URL'];
    if (!redisUrl) throw new AppError(500, 'TI_REDIS_URL is not set', 'CONFIG_ERROR');
    const url = new URL(redisUrl);
    queue = new Queue(QUEUES.EMAIL_SEND, {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: decodeURIComponent(url.password || '') || undefined,
        maxRetriesPerRequest: null,
      },
    });
  }
  return queue;
}

/** Max wait for Redis to accept the job before the caller gives up (the request must not hang). */
export const ENQUEUE_TIMEOUT_MS = 5_000;

export async function enqueueEmailJob(payload: EmailJobPayload): Promise<void> {
  if (payload.queue !== QUEUES.EMAIL_SEND) {
    throw new AppError(500, 'Unexpected email queue', 'INVALID_EMAIL_QUEUE');
  }
  // maxRetriesPerRequest: null makes add() wait forever while Redis is down; cap it so
  // /register still answers. The pending add() still lands if Redis comes back.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError(503, 'Email queue unavailable', 'EMAIL_QUEUE_TIMEOUT')),
      ENQUEUE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([getQueue().add(payload.data.type, payload.data, EMAIL_JOB_OPTIONS), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
