/**
 * @module @etip/shared-utils/tests/constants-errors
 * @description Tests for QUEUES, EVENTS constants and AppError class.
 */
import { describe, it, expect } from 'vitest';
import {
  QUEUES,
  ALL_QUEUE_NAMES,
  EVENTS,
  ALL_EVENT_TYPES,
  AppError,
  Errors,
} from '../src/index.js';

// ── QUEUES Tests ───────────────────────────────────────────────────

describe('QUEUES', () => {
  it('has exactly 24 queue names', () => {
    expect(Object.keys(QUEUES)).toHaveLength(24);
  });

  it('all queue names start with etip- prefix (RCA #42: no colons)', () => {
    for (const name of Object.values(QUEUES)) {
      expect(name).toMatch(/^etip-/);
    }
  });

  it('contains required pipeline queues', () => {
    expect(QUEUES.FEED_FETCH).toBe('etip-feed-fetch');
    expect(QUEUES.NORMALIZE).toBe('etip-normalize');
    expect(QUEUES.ENRICH_REALTIME).toBe('etip-enrich-realtime');
    expect(QUEUES.ENRICH_BATCH).toBe('etip-enrich-batch');
    expect(QUEUES.GRAPH_SYNC).toBe('etip-graph-sync');
    expect(QUEUES.CORRELATE).toBe('etip-correlate');
    expect(QUEUES.ARCHIVE).toBe('etip-archive');
  });

  it('ALL_QUEUE_NAMES matches QUEUES values', () => {
    expect(ALL_QUEUE_NAMES).toEqual(Object.values(QUEUES));
    expect(ALL_QUEUE_NAMES).toHaveLength(24);
  });

  it('queue names are unique', () => {
    const set = new Set(Object.values(QUEUES));
    expect(set.size).toBe(Object.values(QUEUES).length);
  });
});

// ── EVENTS Tests ───────────────────────────────────────────────────

describe('EVENTS', () => {
  it('has exactly 25 event types', () => {
    expect(Object.keys(EVENTS)).toHaveLength(25);
  });

  it('all event types use dot-notation', () => {
    for (const event of Object.values(EVENTS)) {
      expect(event).toMatch(/^[a-z]+\.[a-z]+(\.[a-z]+)?$/);
    }
  });

  it('contains pipeline events in correct order', () => {
    expect(EVENTS.FEED_FETCHED).toBe('feed.fetched');
    expect(EVENTS.IOC_NORMALIZED).toBe('ioc.normalized');
    expect(EVENTS.IOC_ENRICHED).toBe('ioc.enriched');
    expect(EVENTS.IOC_CREATED).toBe('ioc.created');
    expect(EVENTS.CORRELATION_MATCH).toBe('correlation.match');
  });

  it('ALL_EVENT_TYPES matches EVENTS values', () => {
    expect(ALL_EVENT_TYPES).toEqual(Object.values(EVENTS));
  });

  it('event names are unique', () => {
    const set = new Set(Object.values(EVENTS));
    expect(set.size).toBe(Object.values(EVENTS).length);
  });
});

// ── AppError Tests ─────────────────────────────────────────────────

describe('AppError', () => {
  it('creates error with all properties', () => {
    const err = new AppError(404, 'IOC not found', 'NOT_FOUND', { id: '123' });
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('IOC not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.details).toEqual({ id: '123' });
    expect(err.timestamp).toBeDefined();
    expect(err.name).toBe('AppError');
  });

  it('defaults code to INTERNAL_ERROR', () => {
    const err = new AppError(500, 'Something broke');
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('is instanceof Error', () => {
    const err = new AppError(400, 'Bad request');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('serializes to standard error JSON shape', () => {
    const err = new AppError(422, 'Invalid input', 'VALIDATION_ERROR', { field: 'value' });
    const json = err.toJSON();
    expect(json).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'value' },
      },
    });
  });

  it('omits details when undefined in toJSON', () => {
    const err = new AppError(500, 'Oops');
    const json = err.toJSON();
    expect(json.error).not.toHaveProperty('details');
  });

  it('isAppError identifies AppError correctly', () => {
    expect(AppError.isAppError(new AppError(400, 'test'))).toBe(true);
    expect(AppError.isAppError(new Error('test'))).toBe(false);
    expect(AppError.isAppError('string')).toBe(false);
    expect(AppError.isAppError(null)).toBe(false);
  });

  it('has proper stack trace', () => {
    const err = new AppError(500, 'Stack test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Stack test');
  });
});

// ── Errors Factory Tests ───────────────────────────────────────────

describe('Errors factory', () => {
  it('notFound creates 404 error', () => {
    const err = Errors.notFound('IOC', '123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('IOC 123 not found');
  });

  it('notFound without id', () => {
    const err = Errors.notFound('Tenant');
    expect(err.message).toBe('Tenant not found');
  });

  it('unauthorized creates 401 error', () => {
    const err = Errors.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('forbidden creates 403 error', () => {
    const err = Errors.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('validation creates 400 error with details', () => {
    const err = Errors.validation('Bad input', { field: 'email' });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('conflict creates 409 error', () => {
    const err = Errors.conflict('Already exists');
    expect(err.statusCode).toBe(409);
  });

  it('rateLimit creates 429 error', () => {
    const err = Errors.rateLimit(60);
    expect(err.statusCode).toBe(429);
    expect(err.details).toEqual({ retryAfter: 60 });
  });

  it('internal creates 500 error', () => {
    const err = Errors.internal();
    expect(err.statusCode).toBe(500);
  });

  it('serviceUnavailable creates 503 error', () => {
    const err = Errors.serviceUnavailable('Redis');
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain('Redis');
  });

  it('invalidStateTransition creates 400 error', () => {
    const err = Errors.invalidStateTransition('NEW', 'ARCHIVED');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_STATE_TRANSITION');
  });
});
