import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  templateTokens,
  defaultTemplate,
  DEFAULT_TEMPLATES,
  NOTIFICATION_EVENTS,
} from './templates';
import {
  retryDelayMs,
  nextRetryAt,
  shouldRetry,
  reminderScheduledAt,
  DEFAULT_REMINDER_LEAD_MINUTES,
} from './delivery';

describe('renderTemplate', () => {
  const vars = { 'customer.firstName': 'Mia', 'business.name': 'Aurora', 'service.name': 'Haircut' };

  it('substitutes known tokens, tolerating inner spaces', () => {
    expect(renderTemplate('Hi {{customer.firstName}} at {{ business.name }}', vars)).toBe('Hi Mia at Aurora');
  });
  it('renders unknown or missing tokens as empty (never leaks a placeholder)', () => {
    expect(renderTemplate('Hi {{customer.firstName}} {{customer.lastName}}!', vars)).toBe('Hi Mia !');
    expect(renderTemplate('{{totally.unknown}}', vars)).toBe('');
  });
  it('leaves text without tokens untouched', () => {
    expect(renderTemplate('No tokens here.', vars)).toBe('No tokens here.');
    expect(renderTemplate('', vars)).toBe('');
  });
  it('does not allow injection via variable values', () => {
    expect(renderTemplate('{{a}}', { a: '{{business.name}}' })).toBe('{{business.name}}');
  });
});

describe('templateTokens', () => {
  it('lists distinct referenced tokens', () => {
    expect(templateTokens('{{a}} {{ b }} {{a}}').sort()).toEqual(['a', 'b']);
  });
});

describe('default templates', () => {
  it('has a default for every catalogued event', () => {
    for (const meta of NOTIFICATION_EVENTS) {
      const t = defaultTemplate(meta.event);
      expect(t.subject.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DEFAULT_TEMPLATES)).toHaveLength(NOTIFICATION_EVENTS.length);
  });
});

describe('retry backoff', () => {
  it('is monotonic non-decreasing and capped', () => {
    const d1 = retryDelayMs(1);
    const d2 = retryDelayMs(2);
    const d3 = retryDelayMs(3);
    expect(d1).toBeLessThan(d2);
    expect(d2).toBeLessThan(d3);
    // beyond the table it caps, not grows unbounded
    expect(retryDelayMs(99)).toBe(retryDelayMs(6));
    expect(retryDelayMs(0)).toBe(retryDelayMs(1));
  });
  it('nextRetryAt offsets from now', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    expect(nextRetryAt(1, now).getTime()).toBe(now.getTime() + retryDelayMs(1));
  });
  it('shouldRetry respects maxAttempts', () => {
    expect(shouldRetry(1, 5)).toBe(true);
    expect(shouldRetry(5, 5)).toBe(false);
    expect(shouldRetry(6, 5)).toBe(false);
  });
});

describe('reminder scheduling', () => {
  it('subtracts the lead time from the start', () => {
    const start = new Date('2030-06-01T15:00:00Z');
    const at = reminderScheduledAt(start);
    expect(start.getTime() - at.getTime()).toBe(DEFAULT_REMINDER_LEAD_MINUTES * 60_000);
  });
  it('honours a custom lead', () => {
    const start = new Date('2030-06-01T15:00:00Z');
    expect(reminderScheduledAt(start, 60).toISOString()).toBe('2030-06-01T14:00:00.000Z');
  });
});
