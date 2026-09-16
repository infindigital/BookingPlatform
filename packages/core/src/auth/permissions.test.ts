import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission, hasAllPermissions } from './permissions';

const perms = ['booking.read', 'booking.approve', 'customer.manage'];

describe('hasPermission', () => {
  it('true when present', () => expect(hasPermission(perms, 'booking.approve')).toBe(true));
  it('false when absent', () => expect(hasPermission(perms, 'settings.manage')).toBe(false));
  it('false for empty/nullish', () => {
    expect(hasPermission([], 'booking.read')).toBe(false);
    expect(hasPermission(undefined, 'booking.read')).toBe(false);
    expect(hasPermission(null, 'booking.read')).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('true when at least one matches', () =>
    expect(hasAnyPermission(perms, ['settings.manage', 'booking.read'])).toBe(true));
  it('false when none match', () =>
    expect(hasAnyPermission(perms, ['settings.manage', 'analytics.read'])).toBe(false));
});

describe('hasAllPermissions', () => {
  it('true when all match', () =>
    expect(hasAllPermissions(perms, ['booking.read', 'customer.manage'])).toBe(true));
  it('false when one missing', () =>
    expect(hasAllPermissions(perms, ['booking.read', 'settings.manage'])).toBe(false));
});
