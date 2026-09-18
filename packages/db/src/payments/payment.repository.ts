import type { Payment, PaymentTransaction, Prisma } from '@prisma/client';
import {
  ValidationError,
  clampMoney,
  derivePaymentStatus,
  sumLedger,
  isPaymentMethod,
  type LedgerEntry,
} from '@booking/core';
import { BaseRepository } from '../repositories/base';

export interface EnsurePaymentInput {
  bookingId: string;
  amountDue: number;
  currency: string;
  provider?: string | null;
}

export interface AddTransactionInput {
  paymentId: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  actorUserId?: string | null;
}

export type PaymentWithTransactions = Payment & { transactions: PaymentTransaction[] };

/**
 * Tenant-scoped payment access. The transaction ledger is the source of truth:
 * every charge/refund is appended, then `amountPaid` (net) and the derived
 * `status` are recomputed from the ledger inside the same DB transaction, so the
 * stored rollup can never drift from the money that actually moved.
 */
export class PaymentRepository extends BaseRepository {
  getByBookingId(bookingId: string): Promise<PaymentWithTransactions | null> {
    return this.db.payment.findFirst({
      where: this.scope({ bookingId }),
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
  }

  getById(id: string): Promise<PaymentWithTransactions | null> {
    return this.db.payment.findFirst({
      where: this.scope({ id }),
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
  }

  /** Create the payment row for a booking if none exists yet. Idempotent. */
  async ensureForBooking(input: EnsurePaymentInput): Promise<Payment> {
    const existing = await this.db.payment.findFirst({ where: this.scope({ bookingId: input.bookingId }) });
    if (existing) return existing;
    const amount = clampMoney(input.amountDue);
    const status = derivePaymentStatus({ amountDue: amount, charged: 0, refunded: 0 });
    return this.db.payment.create({
      data: {
        businessId: this.businessId,
        bookingId: input.bookingId,
        amount,
        amountPaid: 0,
        currency: input.currency || 'USD',
        provider: input.provider ?? null,
        status,
      },
    });
  }

  /** Record a collected charge and recompute the rollup + status atomically. */
  recordCharge(input: AddTransactionInput): Promise<PaymentWithTransactions | null> {
    return this.addTransaction('CHARGE', input);
  }

  /** Record a refund (never more than the net collected) and recompute. */
  recordRefund(input: AddTransactionInput): Promise<PaymentWithTransactions | null> {
    return this.addTransaction('REFUND', input);
  }

  private async addTransaction(
    type: 'CHARGE' | 'REFUND',
    input: AddTransactionInput,
  ): Promise<PaymentWithTransactions | null> {
    const amount = clampMoney(input.amount);
    if (amount <= 0) throw new ValidationError('Enter an amount greater than zero.');
    const method = input.method?.trim() || null;
    if (method && !isPaymentMethod(method)) throw new ValidationError('Unknown payment method.');

    return this.db.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: input.paymentId, businessId: this.businessId } });
      if (!payment) return null;

      const priorTxns = await tx.paymentTransaction.findMany({ where: { paymentId: payment.id, businessId: this.businessId } });
      const prior = sumLedger(priorTxns.map(toLedgerEntry));

      if (type === 'REFUND' && amount > prior.net) {
        throw new ValidationError(`You can refund at most ${prior.net.toFixed(2)}.`);
      }

      await tx.paymentTransaction.create({
        data: {
          businessId: this.businessId,
          paymentId: payment.id,
          type,
          amount,
          method,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          createdByUserId: input.actorUserId ?? null,
        },
      });

      const all = await tx.paymentTransaction.findMany({ where: { paymentId: payment.id, businessId: this.businessId } });
      const totals = sumLedger(all.map(toLedgerEntry));
      const status = derivePaymentStatus({
        amountDue: Number(payment.amount),
        charged: totals.charged,
        refunded: totals.refunded,
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { amountPaid: totals.net, status },
      });

      return tx.payment.findFirst({
        where: { id: payment.id, businessId: this.businessId },
        include: { transactions: { orderBy: { createdAt: 'desc' } } },
      });
    });
  }
}

function toLedgerEntry(t: { type: string; amount: Prisma.Decimal | number }): LedgerEntry {
  return { type: t.type === 'REFUND' ? 'REFUND' : 'CHARGE', amount: Number(t.amount) };
}
