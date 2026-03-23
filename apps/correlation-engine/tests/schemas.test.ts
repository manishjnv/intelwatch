import { describe, it, expect } from 'vitest';
import {
  ListCorrelationsQuerySchema, FeedbackInputSchema,
  CampaignListQuerySchema, CorrelationStore,
} from '../src/schemas/correlation.js';

describe('Correlation Engine — Schemas', () => {
  describe('ListCorrelationsQuerySchema', () => {
    it('1. applies defaults for empty query', () => {
      const result = ListCorrelationsQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.type).toBeUndefined();
    });

    it('2. parses valid type and severity filters', () => {
      const result = ListCorrelationsQuerySchema.parse({
        page: '2', limit: '10', type: 'cooccurrence', severity: 'HIGH',
      });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.type).toBe('cooccurrence');
      expect(result.severity).toBe('HIGH');
    });

    it('3. rejects invalid correlation type', () => {
      expect(() => ListCorrelationsQuerySchema.parse({ type: 'invalid' }))
        .toThrow();
    });
  });

  describe('FeedbackInputSchema', () => {
    it('4. accepts valid true_positive feedback', () => {
      const result = FeedbackInputSchema.parse({ verdict: 'true_positive', reason: 'Confirmed' });
      expect(result.verdict).toBe('true_positive');
      expect(result.reason).toBe('Confirmed');
    });

    it('5. rejects invalid verdict', () => {
      expect(() => FeedbackInputSchema.parse({ verdict: 'maybe' }))
        .toThrow();
    });
  });

  describe('CorrelationStore', () => {
    it('6. initializes tenant Maps lazily', () => {
      const store = new CorrelationStore();
      const iocs = store.getTenantIOCs('t1');
      expect(iocs.size).toBe(0);
      // Same reference on second call
      iocs.set('a', {} as never);
      expect(store.getTenantIOCs('t1').size).toBe(1);
    });
  });
});
