/**
 * @module workers/webhook-delivery
 * @description BullMQ worker that delivers webhook payloads to subscriber endpoints.
 * Stripe-style exponential backoff: 1m, 5m, 30m, 2h, 12h, 24h (6 attempts).
 * Auto-disables subscription after all attempts exhausted.
 * HMAC-SHA256 signature on every request.
 *
 * Started alongside the API gateway. Consumes from QUEUES.WEBHOOK_DELIVERY.
 */
import { Worker, type Job } from 'bullmq';
import { createHmac } from 'crypto';
import { QUEUES } from '@etip/shared-utils';
import type { WebhookDeliveryPayload } from '@etip/shared-types';
import { prisma } from '../prisma.js';

/**
 * Stripe-style backoff delays in milliseconds.
 * Attempt 1: 1 min, 2: 5 min, 3: 30 min, 4: 2 hr, 5: 12 hr, 6: 24 hr.
 */
export const BACKOFF_DELAYS_MS = [
  1 * 60_000,       // 1 minute
  5 * 60_000,       // 5 minutes
  30 * 60_000,      // 30 minutes
  2 * 3600_000,     // 2 hours
  12 * 3600_000,    // 12 hours
  24 * 3600_000,    // 24 hours
] as const;

export const MAX_ATTEMPTS = BACKOFF_DELAYS_MS.length;

/**
 * Calculate backoff delay for a given attempt number (1-based).
 * Used by BullMQ custom backoff strategy.
 */
export function calculateBackoff(attemptsMade: number): number {
  const idx = Math.min(attemptsMade - 1, BACKOFF_DELAYS_MS.length - 1);
  return (BACKOFF_DELAYS_MS as readonly number[])[idx] ?? 86_400_000;
}

/**
 * Deliver a single webhook payload to the subscriber endpoint.
 */
async function deliverWebhook(job: Job<WebhookDeliveryPayload>): Promise<void> {
  const { subscriptionId, url, secret, event, data } = job.data;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data,
  });

  const signature = createHmac('sha256', secret).update(body).digest('hex');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Event': event,
      'User-Agent': 'IntelWatch-ETIP/1.0',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Webhook endpoint returned ${response.status}`);
  }

  // Success: reset fail counter
  await prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: { failCount: 0, lastSuccess: new Date() },
  }).catch(() => { /* non-fatal — subscription may have been deleted */ });
}

/**
 * Handle final failure after all retry attempts exhausted.
 * Auto-disables the subscription.
 */
async function handleFinalFailure(subscriptionId: string, error: string): Promise<void> {
  try {
    await prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        active: false,
        disabledAt: new Date(),
        failCount: { increment: 1 },
        lastFailure: new Date(),
      },
    });

    console.warn(
      `[webhook-delivery] Subscription ${subscriptionId} disabled after ${MAX_ATTEMPTS} failed attempts: ${error}`,
    );
  } catch { /* subscription may have been deleted */ }
}

/**
 * Handle intermediate failure (not yet exhausted all retries).
 * Increments fail counter for observability.
 */
async function handleRetryFailure(subscriptionId: string): Promise<void> {
  try {
    await prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        failCount: { increment: 1 },
        lastFailure: new Date(),
      },
    });
  } catch { /* subscription may have been deleted */ }
}

/**
 * Start the webhook delivery worker.
 * @param redisUrl - Redis connection URL for BullMQ
 */
export function startWebhookDeliveryWorker(redisUrl: string): Worker<WebhookDeliveryPayload> {
  const worker = new Worker<WebhookDeliveryPayload>(
    QUEUES.WEBHOOK_DELIVERY,
    async (job) => {
      await deliverWebhook(job);
    },
    {
      connection: { url: redisUrl },
      concurrency: 5,
      limiter: { max: 50, duration: 60_000 },
      settings: {
        backoffStrategy: (attemptsMade: number) => calculateBackoff(attemptsMade),
      },
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { subscriptionId } = job.data;
    const isLastAttempt = (job.attemptsMade ?? 0) >= MAX_ATTEMPTS;

    if (isLastAttempt) {
      await handleFinalFailure(subscriptionId, err.message);
    } else {
      await handleRetryFailure(subscriptionId);
    }
  });

  worker.on('error', (err) => {
    console.error('[webhook-delivery] Worker error:', err.message);
  });

  return worker;
}

/**
 * Default job options for webhook delivery jobs.
 * Producers MUST spread these options when adding jobs to the queue.
 *
 * @example
 * ```ts
 * await queue.add('deliver', payload, WEBHOOK_JOB_OPTIONS);
 * ```
 */
export const WEBHOOK_JOB_OPTIONS = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'custom' as const },
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;
