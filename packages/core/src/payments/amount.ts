import { clampMoney } from './money';
import type { PaymentMode, PaymentSettings } from './settings';

/**
 * The amount a customer owes at booking time, derived from the service price and
 * the business's payment policy. Computed on the backend only - the client never
 * supplies a price or an amount due.
 */
export interface AmountDue {
  mode: PaymentMode;
  /** The full booking price. */
  total: number;
  /** What is required now (0 for NONE; a deposit; or the full total). */
  amountDue: number;
  /** True when the required amount is a partial deposit (less than the total). */
  isDeposit: boolean;
}

export function computeAmountDue(price: number, settings: PaymentSettings): AmountDue {
  const total = clampMoney(price);

  if (settings.mode === 'NONE') {
    return { mode: 'NONE', total, amountDue: 0, isDeposit: false };
  }
  if (settings.mode === 'FULL') {
    return { mode: 'FULL', total, amountDue: total, isDeposit: false };
  }

  // DEPOSIT - a percentage of the total or a fixed amount, never above the total.
  const due =
    settings.depositType === 'PERCENT'
      ? clampMoney((total * settings.depositValue) / 100, 0, total)
      : clampMoney(settings.depositValue, 0, total);

  return { mode: 'DEPOSIT', total, amountDue: due, isDeposit: due < total };
}
