import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { processEmailJob } from '../src/workers/email-send-worker.js';

describe('processEmailJob', () => {
  const platformUrl = 'https://intelwatch.in';
  const validData = {
    type: 'email_verification',
    userId: 'user-1',
    email: 'test@example.com',
    token: 'a'.repeat(64),
    tenantName: 'Acme Corp',
  };

  it('calls injected send once with mapped params for a valid payload', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await processEmailJob(validData, { platformUrl, send });

    expect(send).toHaveBeenCalledTimes(1);
    // tenantName is sign-up input and must never be passed on to the email body
    expect(send).toHaveBeenCalledWith({
      to: validData.email,
      token: validData.token,
      platformUrl,
    });
  });

  it('rejects with UnrecoverableError and does not call send when type is wrong', async () => {
    const send = vi.fn();
    const bad = { ...validData, type: 'not_email_verification' };
    await expect(processEmailJob(bad, { platformUrl, send })).rejects.toThrow(UnrecoverableError);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects with UnrecoverableError when token is not 64 lowercase hex chars, message excludes the token value', async () => {
    const send = vi.fn();
    const bad = { ...validData, token: 'NOT-A-VALID-TOKEN' };
    let caught: unknown;
    try {
      await processEmailJob(bad, { platformUrl, send });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnrecoverableError);
    expect((caught as Error).message).not.toContain('NOT-A-VALID-TOKEN');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects with UnrecoverableError when email is invalid', async () => {
    const send = vi.fn();
    const bad = { ...validData, email: 'not-an-email' };
    await expect(processEmailJob(bad, { platformUrl, send })).rejects.toThrow(UnrecoverableError);
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates a rejection from send so BullMQ retries', async () => {
    const send = vi.fn().mockRejectedValue(new Error('resend down'));
    await expect(processEmailJob(validData, { platformUrl, send })).rejects.toThrow('resend down');
  });
});

describe('sendVerificationEmail', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.doUnmock('resend');
  });

  it('throws EMAIL_NOT_CONFIGURED when Resend was never initialised', async () => {
    vi.doMock('resend', () => ({ Resend: vi.fn() }));
    const { sendVerificationEmail } = await import('../src/services/email-sender.js');

    await expect(
      sendVerificationEmail({
        to: 'user@example.com',
        token: 'a'.repeat(64),
        platformUrl: 'https://intelwatch.in',
      })
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED', statusCode: 503 });
  });

  it('builds the verify link and sends via Resend', async () => {
    const sendMock = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
    vi.doMock('resend', () => ({
      Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));

    const { initEmailSender, sendVerificationEmail } = await import('../src/services/email-sender.js');

    initEmailSender({
      TI_RESEND_API_KEY: 'test-key',
      TI_FROM_EMAIL: 'IntelWatch ETIP <noreply@intelwatch.in>',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const token = 'b'.repeat(64);
    await sendVerificationEmail({
      to: 'user@example.com',
      token,
      platformUrl: 'https://intelwatch.in',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]![0] as { html: string; text: string; to: string };
    expect(call.to).toBe('user@example.com');
    expect(call.html).toContain(`https://intelwatch.in/auth/verify-email?token=${token}`);
    expect(call.text).toContain(`https://intelwatch.in/auth/verify-email?token=${token}`);
  });

  it('throws EMAIL_SEND_FAILED when Resend returns an error object', async () => {
    const sendMock = vi.fn().mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'invalid from address' },
    });
    vi.doMock('resend', () => ({
      Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));

    const { initEmailSender, sendVerificationEmail } = await import('../src/services/email-sender.js');
    initEmailSender({
      TI_RESEND_API_KEY: 'test-key',
      TI_FROM_EMAIL: 'IntelWatch ETIP <noreply@intelwatch.in>',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(
      sendVerificationEmail({
        to: 'user@example.com',
        token: 'c'.repeat(64),
        platformUrl: 'https://intelwatch.in',
      })
    ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED', statusCode: 502 });
  });
});
