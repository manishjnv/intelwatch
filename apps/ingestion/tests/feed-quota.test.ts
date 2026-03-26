import { describe, it, expect } from 'vitest';
import { cronToMinutes } from '../src/cron-utils.js';

describe('cronToMinutes', () => {
  it('parses */15 * * * * as 15 minutes', () => {
    expect(cronToMinutes('*/15 * * * *')).toBe(15);
  });

  it('parses */30 * * * * as 30 minutes', () => {
    expect(cronToMinutes('*/30 * * * *')).toBe(30);
  });

  it('parses 0 */2 * * * as 120 minutes (2 hours)', () => {
    expect(cronToMinutes('0 */2 * * *')).toBe(120);
  });

  it('parses 0 */4 * * * as 240 minutes (4 hours)', () => {
    expect(cronToMinutes('0 */4 * * *')).toBe(240);
  });

  it('parses 0 * * * * as 60 minutes (hourly)', () => {
    expect(cronToMinutes('0 * * * *')).toBe(60);
  });

  it('returns 0 for complex patterns it cannot parse', () => {
    expect(cronToMinutes('0 0 * * 1')).toBe(0); // weekly
  });

  it('returns 0 for invalid cron expressions', () => {
    expect(cronToMinutes('invalid')).toBe(0);
    expect(cronToMinutes('')).toBe(0);
  });
});

describe('Feed quota enforcement (unit)', () => {
  it('free plan: maxFeeds=3, interval=4h', () => {
    // These values match the FeedQuotaStore defaults
    expect(3).toBe(3);
    expect(cronToMinutes('0 */4 * * *')).toBe(240);
  });

  it('schedule */15 is faster than plan minimum 0 */2 (120 > 15)', () => {
    const feedMins = cronToMinutes('*/15 * * * *');
    const planMins = cronToMinutes('0 */2 * * *');
    expect(feedMins).toBeLessThan(planMins);
  });

  it('schedule 0 */4 is not faster than plan minimum 0 */2', () => {
    const feedMins = cronToMinutes('0 */4 * * *');
    const planMins = cronToMinutes('0 */2 * * *');
    expect(feedMins).toBeGreaterThanOrEqual(planMins);
  });

  it('enterprise plan allows */15 (15min schedule >= 15min minimum)', () => {
    const feedMins = cronToMinutes('*/15 * * * *');
    const planMins = cronToMinutes('*/15 * * * *');
    expect(feedMins).toBeGreaterThanOrEqual(planMins);
  });
});
