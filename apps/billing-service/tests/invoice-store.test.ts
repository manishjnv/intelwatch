import { describe, it, expect, beforeEach } from 'vitest';
import { InvoiceStore } from '../src/services/invoice-store.js';

describe('InvoiceStore', () => {
  let store: InvoiceStore;

  beforeEach(() => {
    store = new InvoiceStore();
  });

  // ── Create invoice ──────────────────────────────────────────────
  describe('createInvoice', () => {
    it('creates an invoice and returns it with generated id', async () => {
      const inv = await store.createInvoice({
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

    it('auto-calculates GST (18%) on invoice creation', async () => {
      const inv = await store.createInvoice({
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
    it('returns invoice by id', async () => {
      const created = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const fetched = await store.getInvoiceById(created.id);
      expect(fetched.id).toBe(created.id);
    });

    it('throws NOT_FOUND for unknown id', async () => {
      await expect(store.getInvoiceById('inv_unknown')).rejects.toThrow('Invoice not found');
    });
  });

  // ── List invoices ───────────────────────────────────────────────
  describe('listInvoices', () => {
    it('returns only invoices for the given tenant', async () => {
      await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      await store.createInvoice({ tenantId: 't2', planId: 'teams', amountInr: 14999, periodStart: new Date(), periodEnd: new Date() });
      const t1Invoices = await store.listInvoices('t1', {});
      expect(t1Invoices.data.every((i) => i.tenantId === 't1')).toBe(true);
    });

    it('supports status filter', async () => {
      const inv = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      await store.updateInvoiceStatus(inv.id, 'paid');
      await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const paid = await store.listInvoices('t1', { status: 'paid' });
      expect(paid.data.every((i) => i.status === 'paid')).toBe(true);
    });

    it('returns empty list for new tenant', async () => {
      const result = await store.listInvoices('new_tenant', {});
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── Update status ───────────────────────────────────────────────
  describe('updateInvoiceStatus', () => {
    it('updates invoice to paid', async () => {
      const inv = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const updated = await store.updateInvoiceStatus(inv.id, 'paid', { razorpayPaymentId: 'pay_abc' });
      expect(updated.status).toBe('paid');
      expect(updated.razorpayPaymentId).toBe('pay_abc');
    });

    it('updates invoice to cancelled', async () => {
      const inv = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const updated = await store.updateInvoiceStatus(inv.id, 'cancelled');
      expect(updated.status).toBe('cancelled');
    });
  });

  // ── GST receipt ─────────────────────────────────────────────────
  describe('generateReceipt', () => {
    it('generates a GST receipt with all required fields', async () => {
      const inv = await store.createInvoice({
        tenantId: 't1',
        planId: 'starter',
        amountInr: 4999,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
        gstNumber: '27AAPFU0939F1ZV',
      });
      await store.updateInvoiceStatus(inv.id, 'paid');
      const receipt = await store.generateReceipt(inv.id);
      expect(receipt.invoiceNumber).toBeDefined();
      expect(receipt.subtotalInr).toBe(4999);
      expect(receipt.gstRate).toBe(18);
      expect(receipt.gstNumber).toBe('27AAPFU0939F1ZV');
    });

    it('generates receipt without GST number when not provided', async () => {
      const inv = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      await store.updateInvoiceStatus(inv.id, 'paid');
      const receipt = await store.generateReceipt(inv.id);
      expect(receipt.gstNumber).toBeUndefined();
    });
  });

  // ── Admin metrics ───────────────────────────────────────────────
  describe('getRevenueMetrics', () => {
    it('calculates total revenue from paid invoices', async () => {
      const i1 = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      const i2 = await store.createInvoice({ tenantId: 't2', planId: 'teams', amountInr: 14999, periodStart: new Date(), periodEnd: new Date() });
      await store.updateInvoiceStatus(i1.id, 'paid');
      await store.updateInvoiceStatus(i2.id, 'paid');
      const metrics = await store.getRevenueMetrics();
      expect(metrics.totalRevenueInr).toBe(19998);
    });

    it('excludes pending and cancelled invoices from revenue', async () => {
      const i1 = await store.createInvoice({ tenantId: 't1', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      await store.createInvoice({ tenantId: 't2', planId: 'teams', amountInr: 14999, periodStart: new Date(), periodEnd: new Date() });
      await store.updateInvoiceStatus(i1.id, 'paid');
      const metrics = await store.getRevenueMetrics();
      expect(metrics.totalRevenueInr).toBe(4999);
    });
  });
});
