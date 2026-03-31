/**
 * @module workers/webhook-delivery
 * @description BullMQ worker that delivers webhook payloads to subscriber endpoints.
 * Retries 3 times with exponential backoff. Auto-disables after 10 consecutive failures.
 *
 * Started alongside the API gateway. Consumes from QUEUES.WEBHOOK_DELIVERY.
 */
import { Worker, type Job } from 'bullmq';
import { createHmac } from 'crypto';
import { QUEUES } from '@etip/shared-utils';
import type { WebhookDeliveryPayload } from '@etip/shared-types';
import { prisma } from '../prisma.js';

const MAX_CONSECUTIVE_FAILURES = 10;

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
  }).catch(() => { /* non-fatal */ });
}

/**
 * Handle delivery failure. Increment fail counter, auto-disable if threshold exceeded.
 */
async function handleFailure(subscriptionId: string, _error: string): Promise<void> {
  try {
    const subscription = await prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        failCount: { increment: 1 },
        lastFailure: new Date(),
      },
    });

    if (subscription.failCount >= MAX_CONSECUTIVE_FAILURES) {
      await prisma.webhookSubscription.update({
        where: { id: subscriptionId },
        data: { active: false, disabledAt: new Date() },
      });
    }
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
      try {
        await deliverWebhook(job);
      } catch (err) {
        await handleFailure(job.data.subscriptionId, (err as Error).message);
        throw err; // Let BullMQ handle retry
      }
    },
    {
      connection: { url: redisUrl },
      concurrency: 5,
      limiter: { max: 50, duration: 60_000 }, // 50 deliveries per minute
    },
  );

  worker.on('error', (err) => {
    console.error('[webhook-delivery] Worker error:', err.message);
  });

  return worker;
}
