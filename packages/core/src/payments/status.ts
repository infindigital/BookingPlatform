import { clampMoney } from './money';
import type { PaymentStatus } from '../booking/status';

/**
 * Payment status is *derived*, never set by hand: it is a pure function of how
 * much is required (amountDue) and the payment ledger (charges minus refunds).
 * This keeps the stored status always consistent with the money that actually
 * moved. PENDING / FAILED are reserved for asynchronous gateway providers and
 * are set by that provider, not derived here. The `PaymentStatus` union is the
 * canonical one from `booking/status` (mirrored by the Prisma enum).
 */
export type { PaymentStatus } from '../booking/status';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PENDING: 'Pending',
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partly paid',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
};

export type LedgerEntryType = 'CHARGE' | 'REFUND';

export interface LedgerEntry {
  type: LedgerEntryType;
  amount: number;
}

export interface PaymentTotals {
  /** Sum of all charges recorded. */
  charged: number;
  /** Sum of all refunds recorded. */
  refunded: number;
  /** charged - refunded, floored at 0. */
  net: number;
}

export function sumLedger(entries: readonly LedgerEntry[]): PaymentTotals {
  let charged = 0;
  let refunded = 0;
  for (const e of entries) {
    const amt = clampMoney(e.amount);
    if (e.type === 'REFUND') refunded += amt;
    else charged += amt;
  }
  charged = clampMoney(charged);
  refunded = clampMoney(refunded);
  return { charged, refunded, net: clampMoney(Math.max(0, charged - refunded)) };
}

export interface DerivePaymentInput {
  amountDue: number;
  charged: number;
  refunded: number;
}

export function derivePaymentStatus(input: DerivePaymentInput): PaymentStatus {
  const due = clampMoney(input.amountDue);
  const charged = clampMoney(input.charged);
  const refunded = clampMoney(input.refunded);
  const net = clampMoney(Math.max(0, charged - refunded));

  // Money was collected and then fully returned.
  if (charged > 0 && net <= 0) return 'REFUNDED';
  // Nothing collected (net) yet.
  if (net <= 0) return 'UNPAID';
  // Nothing was required but money was taken → treat as settled.
  if (due <= 0) return 'PAID';
  // Enough collected to cover what was required (tiny epsilon for float safety).
  if (net + 0.0001 >= due) return 'PAID';
  return 'PARTIALLY_PAID';
}

/** What remains to reach the required amount, floored at 0. */
export function remainingBalance(amountDue: number, net: number): number {
  return clampMoney(Math.max(0, clampMoney(amountDue) - clampMoney(net)));
}
