import { AppError } from '@etip/shared-utils';
import type { PlanId } from '../schemas/billing.js';
import type { CouponRepo } from '../repository.js';

export type DiscountType = 'percentage' | 'flat';

/** A coupon/discount code definition. */
export interface Coupon {
  code: string;
  discountType: DiscountType;
  discountValue: number;        // % for percentage, INR for flat
  maxUses: number;
  usageCount: number;
  expiresAt: Date;
  applicablePlans?: PlanId[];   // undefined = all plans
  createdAt: Date;
}

/** Result of applying a coupon to an invoice amount. */
export interface CouponApplicationResult {
  code: string;
  discountType: DiscountType;
  discountAmountInr: number;
  finalAmountInr: number;
}

/** Result of validating a coupon code. */
export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  reason?: string;
}

/** Dual-mode coupon store. Prisma-backed when repo provided, in-memory fallback. */
export class CouponStore {
  private readonly coupons = new Map<string, Coupon>();
  private readonly usageLog = new Map<string, string[]>(); // code → [tenantId, ...]
  private readonly repo?: CouponRepo;

  constructor(repo?: CouponRepo) {
    this.repo = repo;
  }

  /** Create a new coupon. Throws DUPLICATE_CODE if code already exists. */
  async createCoupon(opts: {
    code: string;
    discountType: DiscountType;
    discountValue: number;
    maxUses: number;
    expiresAt: Date;
    applicablePlans?: PlanId[];
  }): Promise<Coupon> {
    if (this.repo) {
      try {
        return await this.repo.createCoupon({
          code: opts.code,
          discountType: opts.discountType,
          discountValue: opts.discountValue,
          maxUses: opts.maxUses,
          expiresAt: opts.expiresAt,
          applicablePlans: opts.applicablePlans,
        });
      } catch (err) {
        // Prisma unique constraint → treat as duplicate
        if (err instanceof Error && err.message.includes('Unique constraint')) {
          throw new AppError(409, `Coupon code already exists: ${opts.code}`, 'DUPLICATE_CODE');
        }
        /* other Prisma errors → fall through to in-memory */
      }
    }
    if (this.coupons.has(opts.code)) {
      throw new AppError(409, `Coupon code already exists: ${opts.code}`, 'DUPLICATE_CODE');
    }
    const coupon: Coupon = {
      code: opts.code,
      discountType: opts.discountType,
      discountValue: opts.discountValue,
      maxUses: opts.maxUses,
      usageCount: 0,
      expiresAt: opts.expiresAt,
      applicablePlans: opts.applicablePlans,
      createdAt: new Date(),
    };
    this.coupons.set(opts.code, coupon);
    return coupon;
  }

  /** Validate a coupon code without consuming it. */
  async validateCoupon(code: string): Promise<CouponValidationResult> {
    if (this.repo) {
      try {
        const coupon = await this.repo.getCoupon(code);
        if (!coupon) return { valid: false, reason: 'Coupon code not found' };
        if (new Date() > coupon.expiresAt) return { valid: false, reason: 'Coupon has expired' };
        if (coupon.usageCount >= coupon.maxUses) return { valid: false, reason: 'Coupon max uses reached' };
        return { valid: true, coupon };
      } catch { /* fall through */ }
    }
    const coupon = this.coupons.get(code);
    if (!coupon) return { valid: false, reason: 'Coupon code not found' };
    if (new Date() > coupon.expiresAt) return { valid: false, reason: 'Coupon has expired' };
    if (coupon.usageCount >= coupon.maxUses) return { valid: false, reason: 'Coupon max uses reached' };
    return { valid: true, coupon };
  }

  /** Get a coupon by code. Throws NOT_FOUND if missing. */
  async getCoupon(code: string): Promise<Coupon> {
    if (this.repo) {
      try {
        const coupon = await this.repo.getCoupon(code);
        if (coupon) return coupon;
      } catch { /* fall through */ }
    }
    const coupon = this.coupons.get(code);
    if (!coupon) throw new AppError(404, `Coupon not found: ${code}`, 'NOT_FOUND');
    return coupon;
  }

  /**
   * Apply a coupon to an original amount and increment its usage counter.
   * Throws INVALID_COUPON if the coupon is expired or exhausted.
   */
  async applyCoupon(code: string, tenantId: string, originalAmountInr: number): Promise<CouponApplicationResult> {
    const validation = await this.validateCoupon(code);
    if (!validation.valid || !validation.coupon) {
      throw new AppError(400, validation.reason ?? 'Invalid coupon', 'INVALID_COUPON');
    }

    const coupon = validation.coupon;
    let discountAmountInr: number;

    if (coupon.discountType === 'percentage') {
      discountAmountInr = Math.round(originalAmountInr * (coupon.discountValue / 100));
    } else {
      discountAmountInr = Math.min(coupon.discountValue, originalAmountInr);
    }

    const finalAmountInr = Math.max(0, originalAmountInr - discountAmountInr);

    // Increment usage in Prisma if available
    if (this.repo) {
      try { await this.repo.incrementUsage(code); } catch { /* fall through */ }
    }
    // Always update in-memory copy
    coupon.usageCount++;
    const log = this.usageLog.get(code) ?? [];
    log.push(tenantId);
    this.usageLog.set(code, log);

    return { code, discountType: coupon.discountType, discountAmountInr, finalAmountInr };
  }

  /** List all coupons. */
  async listCoupons(): Promise<Coupon[]> {
    if (this.repo) {
      try { return await this.repo.listCoupons(); } catch { /* fall through */ }
    }
    return Array.from(this.coupons.values());
  }
}
