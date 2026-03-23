import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { PlanId } from '../schemas/billing.js';

export type InvoiceStatus = 'pending' | 'paid' | 'cancelled' | 'failed';

/** A billing invoice record. */
export interface Invoice {
  id: string;
  tenantId: string;
  planId: PlanId;
  status: InvoiceStatus;
  amountInr: number;
  gstAmountInr: number;
  totalAmountInr: number;
  gstNumber?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** GST receipt data for download/display. */
export interface GstReceipt {
  invoiceNumber: string;
  invoiceDate: string;
  tenantId: string;
  planName: string;
  subtotalInr: number;
  gstRate: number;
  gstAmountInr: number;
  totalAmountInr: number;
  gstNumber?: string;
  periodStart: string;
  periodEnd: string;
  paymentId?: string;
}

/** Revenue metrics for admin dashboard. */
export interface RevenueMetrics {
  totalRevenueInr: number;
  paidInvoiceCount: number;
  pendingInvoiceCount: number;
  cancelledInvoiceCount: number;
}

/** Paginated invoice list result. */
export interface InvoiceListResult {
  data: Invoice[];
  total: number;
  page: number;
  limit: number;
}

const GST_RATE = 0.18;
let invoiceSeq = 1;

/** In-memory invoice store with GST support. */
export class InvoiceStore {
  private readonly invoices = new Map<string, Invoice>();

  /** Create a new invoice. GST at 18% is calculated automatically. */
  createInvoice(opts: {
    tenantId: string;
    planId: PlanId;
    amountInr: number;
    periodStart: Date;
    periodEnd: Date;
    gstNumber?: string;
  }): Invoice {
    const gstAmount = Math.round(opts.amountInr * GST_RATE);
    const id = `inv_${String(invoiceSeq++).padStart(6, '0')}_${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const invoice: Invoice = {
      id,
      tenantId: opts.tenantId,
      planId: opts.planId,
      status: 'pending',
      amountInr: opts.amountInr,
      gstAmountInr: gstAmount,
      totalAmountInr: opts.amountInr + gstAmount,
      gstNumber: opts.gstNumber,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      createdAt: now,
      updatedAt: now,
    };
    this.invoices.set(id, invoice);
    return invoice;
  }

  /** Get an invoice by id. Throws NOT_FOUND for unknown ids. */
  getInvoiceById(id: string): Invoice {
    const invoice = this.invoices.get(id);
    if (!invoice) throw new AppError(404, `Invoice not found: ${id}`, 'NOT_FOUND');
    return invoice;
  }

  /** List invoices for a tenant with optional status filter and pagination. */
  listInvoices(
    tenantId: string,
    opts: { status?: InvoiceStatus; page?: number; limit?: number },
  ): InvoiceListResult {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    let all = Array.from(this.invoices.values()).filter((i) => i.tenantId === tenantId);
    if (opts.status) all = all.filter((i) => i.status === opts.status);
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = all.length;
    const data = all.slice((page - 1) * limit, page * limit);
    return { data, total, page, limit };
  }

  /** Update the status of an invoice. Optionally attach Razorpay payment metadata. */
  updateInvoiceStatus(
    id: string,
    status: InvoiceStatus,
    opts?: { razorpayPaymentId?: string; razorpayOrderId?: string },
  ): Invoice {
    const invoice = this.getInvoiceById(id);
    invoice.status = status;
    invoice.updatedAt = new Date();
    if (opts?.razorpayPaymentId) invoice.razorpayPaymentId = opts.razorpayPaymentId;
    if (opts?.razorpayOrderId) invoice.razorpayOrderId = opts.razorpayOrderId;
    return invoice;
  }

  /** Generate a GST-compliant receipt for a paid invoice. Throws NOT_FOUND if invoice is missing. */
  generateReceipt(id: string): GstReceipt {
    const invoice = this.getInvoiceById(id);
    return {
      invoiceNumber: invoice.id.toUpperCase(),
      invoiceDate: invoice.createdAt.toISOString().slice(0, 10),
      tenantId: invoice.tenantId,
      planName: invoice.planId.charAt(0).toUpperCase() + invoice.planId.slice(1),
      subtotalInr: invoice.amountInr,
      gstRate: Math.round(GST_RATE * 100),
      gstAmountInr: invoice.gstAmountInr,
      totalAmountInr: invoice.totalAmountInr,
      gstNumber: invoice.gstNumber,
      periodStart: invoice.periodStart.toISOString().slice(0, 10),
      periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
      paymentId: invoice.razorpayPaymentId,
    };
  }

  /** Return aggregate revenue metrics from all invoices. */
  getRevenueMetrics(): RevenueMetrics {
    let totalRevenueInr = 0;
    let paidInvoiceCount = 0;
    let pendingInvoiceCount = 0;
    let cancelledInvoiceCount = 0;

    for (const inv of this.invoices.values()) {
      if (inv.status === 'paid') {
        totalRevenueInr += inv.amountInr;
        paidInvoiceCount++;
      } else if (inv.status === 'pending') {
        pendingInvoiceCount++;
      } else if (inv.status === 'cancelled') {
        cancelledInvoiceCount++;
      }
    }
    return { totalRevenueInr, paidInvoiceCount, pendingInvoiceCount, cancelledInvoiceCount };
  }

  /** Get all invoices matching a Razorpay order id (for webhook reconciliation). */
  findByOrderId(orderId: string): Invoice | undefined {
    for (const inv of this.invoices.values()) {
      if (inv.razorpayOrderId === orderId) return inv;
    }
    return undefined;
  }
}
