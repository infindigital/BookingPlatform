/**
 * Payment provider seam.
 *
 * The payment *engine* (policy, amount-due computation, the transaction ledger,
 * rollup + derived status, admin recording, reporting) is real and fully
 * exercised. How money is *collected* is abstracted here so a real gateway can
 * be registered later without touching the engine.
 *
 * The default — and the only one shipped — is the **manual / offline** provider:
 * staff record cash, card-in-person, or bank-transfer payments. This honours the
 * cost policy (no mandatory paid payment gateway) while remaining a genuine,
 * complete payment system.
 */
export type PaymentProviderKind = 'manual' | 'gateway';

export interface PaymentProvider {
  key: string;
  label: string;
  /** 'manual' = staff record offline payments; 'gateway' = charges via an API. */
  kind: PaymentProviderKind;
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly key = 'manual';
  readonly label = 'Manual / offline';
  readonly kind = 'manual' as const;
}

export const DEFAULT_PAYMENT_PROVIDER = 'manual';

const manual = new ManualPaymentProvider();
const registry = new Map<string, PaymentProvider>([[manual.key, manual]]);

/** Register a concrete provider (used by a future gateway integration / tests). */
export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.key, provider);
}

export function getPaymentProvider(key: string | null | undefined): PaymentProvider {
  return (key && registry.get(key)) || manual;
}

export function listPaymentProviders(): PaymentProvider[] {
  return [...registry.values()];
}
