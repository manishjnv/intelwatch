/**
 * @module api-gateway/tests/email-queue
 * @description Tests for the BullMQ producer in ../src/routes/email-queue.ts:
 *   - add() called with (type, data, EMAIL_JOB_OPTIONS)
 *   - wrong queue name rejects INVALID_EMAIL_QUEUE, add() never called
 *   - missing TI_REDIS_URL rejects CONFIG_ERROR
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QUEUES } from '@etip/shared-utils';

const { mockQueue } = vi.hoisted(() => {
  const mockQueue = { add: vi.fn(async () => ({})) };
  return { mockQueue };
});

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => mockQueue),
}));

const ORIGINAL_REDIS_URL = process.env['TI_REDIS_URL'];

describe('email-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // fresh module instance per test so the lazily-created Queue singleton resets
    vi.resetModules();
    process.env['TI_REDIS_URL'] = 'redis://localhost:6379';
  });

  afterEach(() => {
    if (ORIGINAL_REDIS_URL === undefined) delete process.env['TI_REDIS_URL'];
    else process.env['TI_REDIS_URL'] = ORIGINAL_REDIS_URL;
  });

  it('calls Queue.add with (type, data, EMAIL_JOB_OPTIONS) for the email-send queue', async () => {
    const { enqueueEmailJob, EMAIL_JOB_OPTIONS } = await import('../src/routes/email-queue.js');
    const payload = {
      queue: QUEUES.EMAIL_SEND,
      data: { type: 'email_verification', userId: 'u-1', email: 'a@b.com', token: 'x'.repeat(64), tenantName: 'ACME' },
    };

    await enqueueEmailJob(payload);

    expect(mockQueue.add).toHaveBeenCalledWith('email_verification', payload.data, EMAIL_JOB_OPTIONS);
  });

  it('rejects with INVALID_EMAIL_QUEUE for a non-email queue name and never calls add', async () => {
    const { enqueueEmailJob } = await import('../src/routes/email-queue.js');
    const payload = { queue: 'etip-ioc-index', data: { type: 'foo' } };

    await expect(enqueueEmailJob(payload)).rejects.toMatchObject({ code: 'INVALID_EMAIL_QUEUE' });
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('rejects with CONFIG_ERROR when TI_REDIS_URL is not set', async () => {
    delete process.env['TI_REDIS_URL'];
    const { enqueueEmailJob } = await import('../src/routes/email-queue.js');
    const payload = { queue: QUEUES.EMAIL_SEND, data: { type: 'email_verification' } };

    await expect(enqueueEmailJob(payload)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
  });

  it('rejects with EMAIL_QUEUE_TIMEOUT instead of hanging when Redis never accepts the job', async () => {
    vi.useFakeTimers();
    try {
      mockQueue.add.mockImplementationOnce(() => new Promise(() => { /* Redis down: never settles */ }));
      const { enqueueEmailJob, ENQUEUE_TIMEOUT_MS } = await import('../src/routes/email-queue.js');
      const pending = enqueueEmailJob({ queue: QUEUES.EMAIL_SEND, data: { type: 'email_verification' } });
      const assertion = expect(pending).rejects.toMatchObject({ code: 'EMAIL_QUEUE_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
