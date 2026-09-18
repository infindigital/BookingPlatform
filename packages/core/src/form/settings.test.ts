import { describe, it, expect } from 'vitest';
import {
  resolveFormSettings,
  resolveSteps,
  hasTeamStep,
  DEFAULT_FORM_SETTINGS,
  DEFAULT_STEPS,
} from './settings';

describe('resolveFormSettings', () => {
  it('returns defaults for empty/invalid input', () => {
    expect(resolveFormSettings(null)).toEqual(DEFAULT_FORM_SETTINGS);
    expect(resolveFormSettings({})).toEqual(DEFAULT_FORM_SETTINGS);
  });
  it('clamps numeric ranges', () => {
    expect(resolveFormSettings({ daysAhead: 999 }).daysAhead).toBe(60);
    expect(resolveFormSettings({ daysAhead: 0 }).daysAhead).toBe(1);
    expect(resolveFormSettings({ minLeadMinutes: -5 }).minLeadMinutes).toBe(0);
  });
  it('keeps valid booleans and truncates the message', () => {
    const s = resolveFormSettings({ requirePhone: true, allowAnyEmployee: false, confirmationMessage: 'x'.repeat(400) });
    expect(s.requirePhone).toBe(true);
    expect(s.allowAnyEmployee).toBe(false);
    expect(s.confirmationMessage).toHaveLength(280);
  });
});

describe('resolveSteps', () => {
  it('returns the default steps for junk', () => {
    expect(resolveSteps('nope')).toEqual(DEFAULT_STEPS);
  });
  it('drops unknown keys and de-duplicates', () => {
    expect(resolveSteps(['service', 'bogus', 'service', 'datetime', 'details', 'confirm'])).toEqual([
      'service',
      'datetime',
      'details',
      'confirm',
    ]);
  });
  it('re-inserts missing required steps', () => {
    const steps = resolveSteps(['service', 'employee']);
    expect(steps).toContain('datetime');
    expect(steps).toContain('details');
    expect(steps).toContain('confirm');
  });
  it('supports omitting the optional employee step', () => {
    const steps = resolveSteps(['service', 'datetime', 'details', 'confirm']);
    expect(hasTeamStep(steps)).toBe(false);
  });
  it('detects the team step when present', () => {
    expect(hasTeamStep(DEFAULT_STEPS)).toBe(true);
  });
});
