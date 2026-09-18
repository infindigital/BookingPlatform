import { describe, it, expect } from 'vitest';
import { roundMoney, clampMoney, normalizeCurrency, formatMoney } from './money';
import { resolvePaymentSettings, sanitizeMethods, DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from './settings';
import { computeAmountDue } from './amount';
import { derivePaymentStatus, sumLedger, remainingBalance } from './status';

const settings = (over: Partial<PaymentSettings> = {}): PaymentSettings => ({ ...DEFAULT_PAYMENT_SETTINGS, ...over });

describe('money', () => {
  it('rounds half away from zero to 2dp', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(10)).toBe(10);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(Number.NaN)).toBe(0);
  });
  it('clamps into range', () => {
    expect(clampMoney(-5)).toBe(0);
    expect(clampMoney(150, 0, 100)).toBe(100);
    expect(clampMoney(42.499, 0, 100)).toBe(42.5);
  });
  it('normalizes currency codes', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('')).toBe('USD');
    expect(normalizeCurrency('EURO')).toBe('USD');
    expect(normalizeCurrency('eur')).toBe('EUR');
  });
  it('formats currency via Intl and never throws on a bad code', () => {
    expect(formatMoney(49.5, 'USD', 'en-US')).toBe('$49.50');
    expect(typeof formatMoney(10, 'ZZZ')).toBe('string');
  });
});

describe('resolvePaymentSettings', () => {
  it('defaults unknown input to a safe NONE policy', () => {
    const s = resolvePaymentSettings(null);
    expect(s.mode).toBe('NONE');
    expect(s.currency).toBe('USD');
    expect(s.methods).toEqual(['cash', 'card']);
  });
  it('clamps a percent deposit to 0..100', () => {
    expect(resolvePaymentSettings({ mode: 'DEPOSIT', depositType: 'PERCENT', depositValue: 250 }).depositValue).toBe(100);
    expect(resolvePaymentSettings({ mode: 'DEPOSIT', depositType: 'PERCENT', depositValue: -5 }).depositValue).toBe(0);
  });
  it('clamps a fixed deposit to >= 0 and keeps cents', () => {
    expect(resolvePaymentSettings({ depositType: 'FIXED', depositValue: 19.9 }).depositValue).toBe(19.9);
    expect(resolvePaymentSettings({ depositType: 'FIXED', depositValue: -3 }).depositValue).toBe(0);
  });
  it('sanitizes methods to the known catalogue in order', () => {
    expect(sanitizeMethods(['card', 'bogus', 'cash', 'cash'])).toEqual(['cash', 'card']);
    expect(sanitizeMethods('nope')).toEqual([]);
  });
});

describe('computeAmountDue', () => {
  it('NONE requires nothing', () => {
    expect(computeAmountDue(80, settings({ mode: 'NONE' }))).toMatchObject({ amountDue: 0, isDeposit: false });
  });
  it('FULL requires the whole price', () => {
    expect(computeAmountDue(80, settings({ mode: 'FULL' }))).toMatchObject({ total: 80, amountDue: 80, isDeposit: false });
  });
  it('DEPOSIT percent takes a fraction of the price', () => {
    const r = computeAmountDue(80, settings({ mode: 'DEPOSIT', depositType: 'PERCENT', depositValue: 25 }));
    expect(r).toMatchObject({ amountDue: 20, isDeposit: true });
  });
  it('DEPOSIT fixed never exceeds the price', () => {
    const r = computeAmountDue(30, settings({ mode: 'DEPOSIT', depositType: 'FIXED', depositValue: 50 }));
    expect(r).toMatchObject({ amountDue: 30, isDeposit: false });
  });
  it('rounds a percent deposit to cents', () => {
    const r = computeAmountDue(99.99, settings({ mode: 'DEPOSIT', depositType: 'PERCENT', depositValue: 33 }));
    expect(r.amountDue).toBe(33); // 32.9967 -> 33.00
  });
});

describe('derivePaymentStatus', () => {
  it('UNPAID when nothing collected', () => {
    expect(derivePaymentStatus({ amountDue: 20, charged: 0, refunded: 0 })).toBe('UNPAID');
  });
  it('PARTIALLY_PAID when net is below the required amount', () => {
    expect(derivePaymentStatus({ amountDue: 20, charged: 10, refunded: 0 })).toBe('PARTIALLY_PAID');
  });
  it('PAID when net meets or exceeds the required amount', () => {
    expect(derivePaymentStatus({ amountDue: 20, charged: 20, refunded: 0 })).toBe('PAID');
    expect(derivePaymentStatus({ amountDue: 20, charged: 25, refunded: 0 })).toBe('PAID');
  });
  it('REFUNDED when everything collected is returned', () => {
    expect(derivePaymentStatus({ amountDue: 20, charged: 20, refunded: 20 })).toBe('REFUNDED');
  });
  it('back to PARTIALLY_PAID after a partial refund', () => {
    expect(derivePaymentStatus({ amountDue: 20, charged: 20, refunded: 5 })).toBe('PARTIALLY_PAID');
  });
  it('PAID when nothing was required but money was taken', () => {
    expect(derivePaymentStatus({ amountDue: 0, charged: 10, refunded: 0 })).toBe('PAID');
  });
  it('sums a ledger and reports remaining balance', () => {
    const totals = sumLedger([
      { type: 'CHARGE', amount: 20 },
      { type: 'CHARGE', amount: 5 },
      { type: 'REFUND', amount: 5 },
    ]);
    expect(totals).toEqual({ charged: 25, refunded: 5, net: 20 });
    expect(remainingBalance(30, totals.net)).toBe(10);
    expect(remainingBalance(20, totals.net)).toBe(0);
  });
});
