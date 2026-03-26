import { describe, it, expect, beforeEach } from 'vitest';
import { InvoiceStore } from '../src/services/invoice-store.js';

describe('InvoiceStore', () => {
  let store: InvoiceStore;

  beforeEach(() => {
    store = new InvoiceStore();
  });

  // ── Create invoice ──────────────────────────────────────────────
  describe('createInvoice', () => {
    it('creates an invoice and returns it with generated id', () => {
      const inv = store.createInvoice({
        tenantId: 't1',
        planId: 'starter',
        amountInr: 4999,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
      });
      expect(inv.id).toBeDefined();
      expect(inv.tenantId).toBe('t1');
      expect(inv.amountInr).toBe(4999);
      expect(inv.status).toBe('pending');
    });

    it('auto-calculates GST (18%) on invoice creation', () => {
      const inv = store.createInvoice({
        tenantId: 't1',
        planId: 'starter',
        amountInr: 4999,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
      });
      expect(inv.gstAmountInr).toBeCloseTo(4999 * 0.18, 0);
      expect(inv.totalAmountInr).toBeCloseTo(4999 * 1.18, 0);
    });
  });

  // ── Get invoice ─────────────────────────────────────────────────
  describe('getInvoiceById', () => {
    it('returns invoice by id', () => {
      const created = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const fetched = store.getInvoiceById(created.id);
      expect(fetched.id).toBe(created.id);
    });

    it('throws NOT_FOUND for unknown id', () => {
      expect(() => store.getInvoiceById('inv_unknown')).toThrow('Invoice not found');
    });
  });

  // ── List invoices ───────────────────────────────────────────────
  describe('listInvoices', () => {
    it('returns only invoices for the given tenant', () => {
      store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      store.createInvoice({ tenantId: 't2', planId: 'teams', amountInr: 14999, periodStart: new Date(), periodEnd: new Date() });
      const t1Invoices = store.listInvoices('t1', {});
      expect(t1Invoices.data.every((i) => i.tenantId === 't1')).toBe(true);
    });

    it('supports status filter', () => {
      const inv = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      store.updateInvoiceStatus(inv.id, 'paid');
      store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const paid = store.listInvoices('t1', { status: 'paid' });
      expect(paid.data.every((i) => i.status === 'paid')).toBe(true);
    });

    it('returns empty list for new tenant', () => {
      const result = store.listInvoices('new_tenant', {});
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── Update status ───────────────────────────────────────────────
  describe('updateInvoiceStatus', () => {
    it('updates invoice to paid', () => {
      const inv = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const updated = store.updateInvoiceStatus(inv.id, 'paid', { razorpayPaymentId: 'pay_abc' });
      expect(updated.status).toBe('paid');
      expect(updated.razorpayPaymentId).toBe('pay_abc');
    });

    it('updates invoice to cancelled', () => {
      const inv = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const updated = store.updateInvoiceStatus(inv.id, 'cancelled');
      expect(updated.status).toBe('cancelled');
    });
  });

  // ── GST receipt ─────────────────────────────────────────────────
  describe('generateReceipt', () => {
    it('generates a GST receipt with all required fields', () => {
      const inv = store.createInvoice({
        tenantId: 't1',
        planId: 'starter',
        amountInr: 4999,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
        gstNumber: '27AAPFU0939F1ZV',
      });
      store.updateInvoiceStatus(inv.id, 'paid');
      const receipt = store.generateReceipt(inv.id);
      expect(receipt.invoiceNumber).toBeDefined();
      expect(receipt.subtotalInr).toBe(4999);
      expect(receipt.gstRate).toBe(18);
      expect(receipt.gstNumber).toBe('27AAPFU0939F1ZV');
    });

    it('generates receipt without GST number when not provided', () => {
      const inv = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      store.updateInvoiceStatus(inv.id, 'paid');
      const receipt = store.generateReceipt(inv.id);
      expect(receipt.gstNumber).toBeUndefined();
    });
  });

  // ── Admin metrics ───────────────────────────────────────────────
  describe('getRevenueMetrics', () => {
    it('calculates total revenue from paid invoices', () => {
      const i1 = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const i2 = store.createInvoice({ tenantId: 't2', planId: 'teams', amountInr: 14999, periodStart: new Date(), periodEnd: new Date() });
      store.updateInvoiceStatus(i1.id, 'paid');
      store.updateInvoiceStatus(i2.id, 'paid');
      const metrics = store.getRevenueMetrics();
      expect(metrics.totalRevenueInr).toBe(19998);
    });

    it('excludes pending and cancelled invoices from revenue', () => {
      const i1 = store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      store.createInvoice({ tenantId: 't2', planId: 'teams', amountInr: 14999, periodStart: new Date(), periodEnd: new Date() });
      store.updateInvoiceStatus(i1.id, 'paid');
      const metrics = store.getRevenueMetrics();
      expect(metrics.totalRevenueInr).toBe(4999);
    });
  });
});
