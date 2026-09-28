/**
 * @module EmailSendWorker
 * @description Consumes QUEUES.EMAIL_SEND jobs produced by user-service
 * (apps/user-service/src/email-verification-service.ts buildEmailJobPayload)
 * and sends the verification email via Resend. Never logs job data, the
 * token, or the verification link.
 */
import { Worker, UnrecoverableError } from 'bullmq';
import type { Logger } from 'pino';
import { z } from 'zod';
import { QUEUES } from '@etip/shared-utils';
import type { AdminConfig } from '../config.js';
import { sendVerificationEmail } from '../services/email-sender.js';

const EmailJobSchema = z.object({
  type: z.literal('email_verification'),
  userId: z.string().min(1),
  email: z.string().email(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  // tenantName is also in the payload but deliberately unused — see sendVerificationEmail.
});

interface ProcessEmailJobDeps {
  platformUrl: string;
  send?: typeof sendVerificationEmail;
}

/** Validate and process one email-send job. Throws UnrecoverableError on bad data (no retry). */
export async function processEmailJob(data: unknown, deps: ProcessEmailJobDeps): Promise<void> {
  const result = EmailJobSchema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new UnrecoverableError(`email-send job failed validation: ${fields}`);
  }

  const send = deps.send ?? sendVerificationEmail;
  await send({
    to: result.data.email,
    token: result.data.token,
    platformUrl: deps.platformUrl,
  });
}

function buildConnection(redisUrl: string): {
  host: string;
  port: number;
  password: string | undefined;
  maxRetriesPerRequest: null;
} {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: decodeURIComponent(url.password || '') || undefined,
    maxRetriesPerRequest: null,
  };
}

/** Start the BullMQ worker for QUEUES.EMAIL_SEND. Call `.close()` on shutdown. */
export function startEmailSendWorker(config: AdminConfig, logger: Logger): Worker {
  const worker = new Worker(
    QUEUES.EMAIL_SEND,
    (job) => processEmailJob(job.data, { platformUrl: config.TI_PLATFORM_URL }),
    {
      connection: buildConnection(config.TI_REDIS_URL),
      concurrency: 5,
      limiter: { max: 2, duration: 1000 }, // Resend default rate limit is 2 req/s
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, userId: (job.data as { userId?: string }).userId }, 'email-send: job completed');
  });
  worker.on('failed', (job, err) => {
    logger.warn(
      { jobId: job?.id, userId: (job?.data as { userId?: string } | undefined)?.userId, attemptsMade: job?.attemptsMade, err: err.message },
      'email-send: job failed'
    );
  });
  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'email-send: worker error');
  });

  return worker;
}
