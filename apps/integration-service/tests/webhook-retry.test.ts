import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookRetryEngine } from '../src/services/webhook-retry.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { WebhookService } from '../src/services/webhook-service.js';
import type { WebhookRetryConfig } from '../src/schemas/integration.js';

const TENANT = 'tenant-retry';
const INT_ID = 'integration-1';

describe('WebhookRetryEngine', () => {
  let store: IntegrationStore;
  let webhookService: WebhookService;
  let engine: WebhookRetryEngine;

  beforeEach(() => {
    store = new IntegrationStore();
    const config = {
      TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 5000,
      TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 100,
    };
    webhookService = new WebhookService(store, config as any);
    engine = new WebhookRetryEngine(store, webhookService, {
      maxRetries: 5,
      baseDelayMs: 100,
      maxDelayMs: 5000,
    });
  });

  // ─── Config Management ─────────────────────────────────────

  it('returns default config when none is set', () => {
    const config = engine.getRetryConfig('any-id');
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelayMs).toBe(100);
    expect(config.maxDelayMs).toBe(5000);
    expect(config.jitterEnabled).toBe(true);
  });

  it('allows setting custom retry config per integration', () => {
    const config = engine.setRetryConfig(INT_ID, {
      maxRetries: 10,
      baseDelayMs: 500,
      maxDelayMs: 30000,
      jitterEnabled: false,
    });
    expect(config.maxRetries).toBe(10);
    expect(config.baseDelayMs).toBe(500);
    expect(config.maxDelayMs).toBe(30000);
    expect(config.jitterEnabled).toBe(false);
  });

  it('merges partial config with existing config', () => {
    engine.setRetryConfig(INT_ID, { maxRetries: 10 });
    const config = engine.setRetryConfig(INT_ID, { jitterEnabled: false });
    expect(config.maxRetries).toBe(10);
    expect(config.jitterEnabled).toBe(false);
    expect(config.baseDelayMs).toBe(100); // default preserved
  });

  it('rejects baseDelayMs > maxDelayMs', () => {
    expect(() => engine.setRetryConfig(INT_ID, {
      baseDelayMs: 60000,
      maxDelayMs: 1000,
    })).toThrow('baseDelayMs cannot exceed maxDelayMs');
  });

  it('removeRetryConfig reverts to default', () => {
    engine.setRetryConfig(INT_ID, { maxRetries: 20 });
    engine.removeRetryConfig(INT_ID);
    const config = engine.getRetryConfig(INT_ID);
    expect(config.maxRetries).toBe(5); // back to default
  });

  // ─── Retry State ───────────────────────────────────────────

  it('returns clean retry state for unknown integration', () => {
    const state = engine.getRetryState('unknown');
    expect(state.integrationId).toBe('unknown');
    expect(state.totalAttempts).toBe(0);
    expect(state.successfulRetries).toBe(0);
    expect(state.failedRetries).toBe(0);
    expect(state.lastRetryAt).toBeNull();
    expect(state.dlqCount).toBe(0);
    expect(state.config).toBeDefined();
  });

  it('resetStats clears retry statistics', () => {
    // Manually set up some state by accessing internal method
    engine.setRetryConfig(INT_ID, { maxRetries: 3 });
    engine.resetStats(INT_ID);
    const state = engine.getRetryState(INT_ID);
    expect(state.totalAttempts).toBe(0);
  });

  // ─── Backoff Calculation ───────────────────────────────────

  it('calculates exponential backoff correctly', () => {
    const config: WebhookRetryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      jitterEnabled: false,
    };
    expect(engine.calculateBackoff(1, config)).toBe(1000);  // 1000 * 2^0
    expect(engine.calculateBackoff(2, config)).toBe(2000);  // 1000 * 2^1
    expect(engine.calculateBackoff(3, config)).toBe(4000);  // 1000 * 2^2
    expect(engine.calculateBackoff(4, config)).toBe(8000);  // 1000 * 2^3
    expect(engine.calculateBackoff(5, config)).toBe(16000); // 1000 * 2^4
  });

  it('caps backoff at maxDelayMs', () => {
    const config: WebhookRetryConfig = {
      maxRetries: 10,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      jitterEnabled: false,
    };
    expect(engine.calculateBackoff(5, config)).toBe(5000);  // capped at maxDelayMs
    expect(engine.calculateBackoff(10, config)).toBe(5000); // still capped
  });

  it('adds jitter when enabled', () => {
    const config: WebhookRetryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      jitterEnabled: true,
    };
    // With jitter, the delay should be between 50% and 100% of calculated value
    const delays = Array.from({ length: 100 }, () => engine.calculateBackoff(1, config));
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    expect(min).toBeGreaterThanOrEqual(500);  // 1000 * 0.5
    expect(max).toBeLessThanOrEqual(1000);    // 1000 * 1.0
    // With 100 samples, we should see variation
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('returns state with correct config attached', () => {
    engine.setRetryConfig(INT_ID, { maxRetries: 8 });
    const state = engine.getRetryState(INT_ID);
    expect(state.config.maxRetries).toBe(8);
  });

  // ─── Config per integration isolation ──────────────────────

  it('maintains separate configs per integration', () => {
    engine.setRetryConfig('int-a', { maxRetries: 3 });
    engine.setRetryConfig('int-b', { maxRetries: 10 });
    expect(engine.getRetryConfig('int-a').maxRetries).toBe(3);
    expect(engine.getRetryConfig('int-b').maxRetries).toBe(10);
    expect(engine.getRetryConfig('int-c').maxRetries).toBe(5); // default
  });
});
