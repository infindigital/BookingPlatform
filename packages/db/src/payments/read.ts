import type { PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { remainingBalance } from '@booking/core';
import { prisma } from '../client';
import { referenceFor } from '../public/reference';

export interface PaymentListRow {
  id: string;
  bookingId: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  amountPaid: number;
  balance: number;
  currency: string;
  provider: string | null;
  customerName: string;
  customerEmail: string | null;
  serviceName: string;
  startISO: string | null;
  createdISO: string;
}

export interface PaymentTransactionRow {
  id: string;
  type: 'CHARGE' | 'REFUND';
  amount: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  createdISO: string;
}

export interface PaymentDetail extends PaymentListRow {
  transactions: PaymentTransactionRow[];
}

export interface PaymentsSummary {
  collected: number;
  outstanding: number;
  refunded: number;
  count: number;
}

export interface PaymentsListFilters {
  status?: PaymentStatus | 'all';
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface PaymentsListResult {
  rows: PaymentListRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
  summary: PaymentsSummary;
}

function baseWhere(businessId: string, f: PaymentsListFilters): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = { businessId };
  const search = f.search?.trim();
  if (search) {
    where.booking = {
      OR: [
        { customer: { firstName: { contains: search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
        { service: { name: { contains: search, mode: 'insensitive' } } },
      ],
    };
  }
  return where;
}

export async function getPaymentsList(
  businessId: string,
  filters: PaymentsListFilters = {},
  db: PrismaClient = prisma,
): Promise<PaymentsListResult> {
  if (!businessId) throw new Error('getPaymentsList requires a businessId.');

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const base = baseWhere(businessId, filters);
  const where: Prisma.PaymentWhereInput =
    filters.status && filters.status !== 'all' ? { ...base, status: filters.status } : base;

  const [rows, total, grouped, allAmounts, refundAgg] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        booking: {
          select: {
            startAt: true,
            customer: { select: { firstName: true, lastName: true, email: true } },
            service: { select: { name: true } },
          },
        },
      },
    }),
    db.payment.count({ where }),
    db.payment.groupBy({ by: ['status'], where: base, _count: true }),
    db.payment.findMany({ where: { businessId }, select: { amount: true, amountPaid: true } }),
    db.paymentTransaction.aggregate({ where: { businessId, type: 'REFUND' }, _sum: { amount: true } }),
  ]);

  const statusCounts: Record<string, number> = {};
  let allCount = 0;
  for (const g of grouped) {
    statusCounts[g.status] = g._count;
    allCount += g._count;
  }
  statusCounts.all = allCount;

  let collected = 0;
  let outstanding = 0;
  for (const p of allAmounts) {
    const amount = Number(p.amount);
    const paid = Number(p.amountPaid);
    collected += paid;
    outstanding += Math.max(0, amount - paid);
  }
  const summary: PaymentsSummary = {
    collected: round2(collected),
    outstanding: round2(outstanding),
    refunded: round2(Number(refundAgg._sum.amount ?? 0)),
    count: allAmounts.length,
  };

  return {
    rows: rows.map((p) => {
      const amount = Number(p.amount);
      const amountPaid = Number(p.amountPaid);
      const customer = p.booking?.customer;
      return {
        id: p.id,
        bookingId: p.bookingId,
        reference: referenceFor(p.bookingId),
        status: p.status,
        amount,
        amountPaid,
        balance: remainingBalance(amount, amountPaid),
        currency: p.currency,
        provider: p.provider,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Unknown',
        customerEmail: customer?.email ?? null,
        serviceName: p.booking?.service?.name ?? 'Service',
        startISO: p.booking?.startAt ? p.booking.startAt.toISOString() : null,
        createdISO: p.createdAt.toISOString(),
      };
    }),
    total,
    page,
    pageSize,
    statusCounts,
    summary,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
