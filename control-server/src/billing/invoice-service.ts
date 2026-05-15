/**
 * Invoice service — generates HTML invoices and converts to PDF (stub).
 * Real PDF generation requires puppeteer or similar; this generates HTML that can be rendered.
 */
import { db } from '../db.js';
import { invoices, orders } from '../billing/billing-schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface InvoiceData {
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  userId: string;
  orderId?: string;
  dueDate?: Date;
}

export class InvoiceService {
  async generateInvoice(data: InvoiceData): Promise<string> {
    const id = randomUUID();
    const now = new Date();

    await db.insert(invoices).values({
      id,
      userId: data.userId,
      orderId: data.orderId || null,
      invoiceNumber: data.invoiceNumber,
      amountCents: data.amountCents,
      currency: data.currency || 'CNY',
      status: 'issued',
      issuedAt: now,
      dueDate: data.dueDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      createdAt: now,
    });

    return id;
  }

  async getInvoiceHtml(invoiceId: string): Promise<string | null> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) return null;

    const [order] = invoice.orderId
      ? await db.select().from(orders).where(eq(orders.id, invoice.orderId)).limit(1)
      : [null];

    const amountYuan = (invoice.amountCents / 100).toFixed(2);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; }
    .header h1 { font-size: 24px; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .table th, .table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    .table th { background: #f5f5f5; }
    .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
    .footer { margin-top: 60px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Invoice</h1>
    <p>Invoice #: ${invoice.invoiceNumber}</p>
    <p>Date: ${invoice.issuedAt?.toString() || 'N/A'}</p>
    <p>Due Date: ${invoice.dueDate?.toString() || 'N/A'}</p>
  </div>
  <table class="table">
    <tr><th>Description</th><th>Amount</th></tr>
    <tr><td>PhoneFarm Subscription</td><td>${invoice.currency} ${amountYuan}</td></tr>
  </table>
  <div class="total">Total: ${invoice.currency} ${amountYuan}</div>
  <div class="footer">
    <p>PhoneFarm — 广州修己科技文化传媒有限公司</p>
    <p>This invoice was generated automatically.</p>
  </div>
</body>
</html>`;
  }

  async listUserInvoices(userId: string, limit = 20, offset = 0) {
    const rows = await db.select().from(invoices)
      .where(eq(invoices.userId, userId))
      .limit(limit).offset(offset);
    return { invoices: rows, total: rows.length };
  }

  async getInvoice(id: string) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return invoice || null;
  }
}

export const invoiceService = new InvoiceService();
