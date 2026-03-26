import { describe, it, expect, beforeEach } from 'vitest';
import { CouponStore } from '../src/services/coupon-store.js';

describe('CouponStore', () => {
  let store: CouponStore;

  beforeEach(() => {
    store = new CouponStore();
  });

  // ── Create coupon ───────────────────────────────────────────────
  describe('createCoupon', () => {
    it('creates a percentage-off coupon', async () => {
      const coupon = await store.createCoupon({
        code: 'SAVE20',
        discountType: 'percentage',
        discountValue: 20,
        maxUses: 100,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      });
      expect(coupon.code).toBe('SAVE20');
      expect(coupon.discountType).toBe('percentage');
      expect(coupon.usageCount).toBe(0);
    });

    it('creates a flat-off coupon', async () => {
      const coupon = await store.createCoupon({
        code: 'FLAT500',
        discountType: 'flat',
        discountValue: 500,
        maxUses: 50,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
      expect(coupon.discountValue).toBe(500);
    });

    it('throws DUPLICATE_CODE for existing code', async () => {
      await store.createCoupon({ code: 'DUP', discountType: 'percentage', discountValue: 10, maxUses: 10, expiresAt: new Date(Date.now() + 86400000) });
      await expect(
        store.createCoupon({ code: 'DUP', discountType: 'flat', discountValue: 100, maxUses: 5, expiresAt: new Date(Date.now() + 86400000) })
      ).rejects.toThrow('Coupon code already exists');
    });
  });

  // ── Validate coupon ─────────────────────────────────────────────
  describe('validateCoupon', () => {
    it('returns valid coupon for a good code', async () => {
      await store.createCoupon({ code: 'VALID10', discountType: 'percentage', discountValue: 10, maxUses: 10, expiresAt: new Date(Date.now() + 86400000) });
      const result = await store.validateCoupon('VALID10');
      expect(result.valid).toBe(true);
      expect(result.coupon?.code).toBe('VALID10');
    });

    it('returns invalid for expired coupon', async () => {
      await store.createCoupon({ code: 'EXPIRED', discountType: 'percentage', discountValue: 10, maxUses: 10, expiresAt: new Date(Date.now() - 1000) });
      const result = await store.validateCoupon('EXPIRED');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/expired/i);
    });

    it('returns invalid when max uses reached', async () => {
      await store.createCoupon({ code: 'USED', discountType: 'percentage', discountValue: 10, maxUses: 1, expiresAt: new Date(Date.now() + 86400000) });
      await store.applyCoupon('USED', 't1', 4999);
      const result = await store.validateCoupon('USED');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/uses/i);
    });

    it('returns invalid for unknown code', async () => {
      const result = await store.validateCoupon('NONEXISTENT');
      expect(result.valid).toBe(false);
    });
  });

  // ── Apply coupon ────────────────────────────────────────────────
  describe('applyCoupon', () => {
    it('applies percentage coupon and returns discounted amount', async () => {
      await store.createCoupon({ code: 'SAVE20', discountType: 'percentage', discountValue: 20, maxUses: 100, expiresAt: new Date(Date.now() + 86400000) });
      const result = await store.applyCoupon('SAVE20', 't1', 4999);
      expect(result.discountAmountInr).toBeCloseTo(4999 * 0.20, 0);
      expect(result.finalAmountInr).toBeCloseTo(4999 * 0.80, 0);
    });

    it('applies flat coupon and returns discounted amount', async () => {
      await store.createCoupon({ code: 'FLAT500', discountType: 'flat', discountValue: 500, maxUses: 100, expiresAt: new Date(Date.now() + 86400000) });
      const result = await store.applyCoupon('FLAT500', 't1', 4999);
      expect(result.discountAmountInr).toBe(500);
      expect(result.finalAmountInr).toBe(4499);
    });

    it('increments usage count on apply', async () => {
      await store.createCoupon({ code: 'COUNT', discountType: 'flat', discountValue: 100, maxUses: 10, expiresAt: new Date(Date.now() + 86400000) });
      await store.applyCoupon('COUNT', 't1', 4999);
      await store.applyCoupon('COUNT', 't2', 4999);
      const coupon = await store.getCoupon('COUNT');
      expect(coupon.usageCount).toBe(2);
    });

    it('throws INVALID_COUPON for already-used coupon', async () => {
      await store.createCoupon({ code: 'ONCE', discountType: 'flat', discountValue: 100, maxUses: 1, expiresAt: new Date(Date.now() + 86400000) });
      await store.applyCoupon('ONCE', 't1', 4999);
      await expect(store.applyCoupon('ONCE', 't2', 4999)).rejects.toThrow();
    });
  });

  // ── List coupons ────────────────────────────────────────────────
  describe('listCoupons', () => {
    it('returns all coupons', async () => {
      await store.createCoupon({ code: 'A', discountType: 'flat', discountValue: 100, maxUses: 10, expiresAt: new Date(Date.now() + 86400000) });
      await store.createCoupon({ code: 'B', discountType: 'percentage', discountValue: 15, maxUses: 5, expiresAt: new Date(Date.now() + 86400000) });
      expect(await store.listCoupons()).toHaveLength(2);
    });

    it('returns empty list when no coupons', async () => {
      expect(await store.listCoupons()).toHaveLength(0);
    });
  });
});
