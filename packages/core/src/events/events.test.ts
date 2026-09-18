import { describe, it, expect } from 'vitest';
import {
  resolveEventInput,
  occupiedSeats,
  seatsRemaining,
  canRegister,
  isSoldOut,
  occupiesSeat,
  EVENT_STATUS_LABELS,
} from './index';
import { ValidationError } from '../errors';

const start = new Date('2031-06-01T18:00:00Z');
const end = new Date('2031-06-01T20:00:00Z');

describe('resolveEventInput', () => {
  it('normalises a valid event', () => {
    const e = resolveEventInput({ title: '  Yoga Class ', description: ' Bring a mat ', startAt: start, endAt: end, capacity: 12.7, price: 25.5, currency: 'eur', status: 'PUBLISHED' });
    expect(e).toMatchObject({ title: 'Yoga Class', description: 'Bring a mat', capacity: 12, price: 25.5, currency: 'EUR', status: 'PUBLISHED' });
  });

  it('defaults capacity/price/currency/status', () => {
    const e = resolveEventInput({ title: 'X', startAt: start, endAt: end });
    expect(e).toMatchObject({ capacity: 0, price: 0, currency: 'USD', status: 'DRAFT', description: null });
  });

  it('rejects missing title, bad interval, negative capacity', () => {
    expect(() => resolveEventInput({ title: '', startAt: start, endAt: end })).toThrow(ValidationError);
    expect(() => resolveEventInput({ title: 'X', startAt: end, endAt: start })).toThrow(ValidationError);
    expect(() => resolveEventInput({ title: 'X', startAt: start, endAt: end, capacity: -1 })).toThrow(ValidationError);
  });

  it('rejects invalid dates', () => {
    expect(() => resolveEventInput({ title: 'X', startAt: new Date('nope'), endAt: end })).toThrow(ValidationError);
  });
});

describe('seat capacity math', () => {
  const regs = [
    { seats: 2, status: 'REGISTERED' as const },
    { seats: 1, status: 'ATTENDED' as const },
    { seats: 3, status: 'CANCELLED' as const }, // freed
    { seats: 1, status: 'NO_SHOW' as const }, // freed
  ];

  it('counts only occupying registrations', () => {
    expect(occupiedSeats(regs)).toBe(3); // 2 registered + 1 attended
    expect(occupiesSeat('REGISTERED')).toBe(true);
    expect(occupiesSeat('CANCELLED')).toBe(false);
  });

  it('computes remaining seats and sold-out', () => {
    expect(seatsRemaining(10, 3)).toBe(7);
    expect(seatsRemaining(3, 5)).toBe(0);
    expect(isSoldOut(3, 3)).toBe(true);
    expect(isSoldOut(3, 2)).toBe(false);
  });

  it('gates registration on remaining capacity', () => {
    expect(canRegister(10, 3, 7)).toBe(true);
    expect(canRegister(10, 3, 8)).toBe(false);
    expect(canRegister(10, 3, 0)).toBe(false);
    expect(canRegister(10, 10, 1)).toBe(false);
  });

  it('exposes readable labels', () => {
    expect(EVENT_STATUS_LABELS.PUBLISHED).toBe('Published');
  });
});
