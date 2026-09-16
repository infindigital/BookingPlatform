import { describe, it, expect } from 'vitest';
import {
  canTransition,
  isTerminal,
  isReschedulable,
  availableActions,
  actionByKey,
  BOOKING_TRANSITIONS,
} from './transitions';
import { BOOKING_STATUSES } from './status';

describe('booking state machine', () => {
  it('allows the core approval-workflow transitions', () => {
    expect(canTransition('PENDING', 'ACCEPTED')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'COMPLETED')).toBe(true);
    expect(canTransition('ACCEPTED', 'NO_SHOW')).toBe(true);
    expect(canTransition('ACCEPTED', 'CANCELLED')).toBe(true);
    expect(canTransition('RESCHEDULED', 'ACCEPTED')).toBe(true);
  });

  it('rejects illegal and self transitions', () => {
    expect(canTransition('ACCEPTED', 'PENDING')).toBe(false); // no going back
    expect(canTransition('COMPLETED', 'ACCEPTED')).toBe(false); // terminal
    expect(canTransition('REJECTED', 'ACCEPTED')).toBe(false); // terminal
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false); // must be accepted first
    expect(canTransition('ACCEPTED', 'ACCEPTED')).toBe(false); // self
  });

  it('marks the four end-states terminal', () => {
    expect(isTerminal('REJECTED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('NO_SHOW')).toBe(true);
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('ACCEPTED')).toBe(false);
  });

  it('permits rescheduling only for slot-occupying statuses', () => {
    expect(isReschedulable('PENDING')).toBe(true);
    expect(isReschedulable('ACCEPTED')).toBe(true);
    expect(isReschedulable('RESCHEDULED')).toBe(true);
    expect(isReschedulable('COMPLETED')).toBe(false);
    expect(isReschedulable('CANCELLED')).toBe(false);
  });

  it('offers approve/reject on a pending booking and lifecycle actions on an accepted one', () => {
    const pending = availableActions('PENDING').map((a) => a.key);
    expect(pending).toContain('approve');
    expect(pending).toContain('reject');
    expect(pending).not.toContain('complete');

    const accepted = availableActions('ACCEPTED').map((a) => a.key);
    expect(accepted).toContain('complete');
    expect(accepted).toContain('no_show');
    expect(accepted).toContain('cancel');
    expect(accepted).not.toContain('approve');

    expect(availableActions('COMPLETED')).toHaveLength(0);
  });

  it('maps each action to a legal target and a permission', () => {
    const approve = actionByKey('approve')!;
    expect(approve.target).toBe('ACCEPTED');
    expect(approve.permission).toBe('booking.approve');
    expect(actionByKey('cancel')!.permission).toBe('booking.write');
    expect(actionByKey('nope')).toBeUndefined();
  });

  it('defines a transition entry for every status', () => {
    for (const s of BOOKING_STATUSES) {
      expect(BOOKING_TRANSITIONS[s]).toBeDefined();
    }
  });
});
