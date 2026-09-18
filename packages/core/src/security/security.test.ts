import { describe, it, expect } from 'vitest';
import { buildSecurityHeaders, framePolicyForPath, BASELINE_SECURITY_HEADERS } from './index';

describe('framePolicyForPath', () => {
  it('denies framing of the admin console and login', () => {
    expect(framePolicyForPath('/admin')).toBe('deny');
    expect(framePolicyForPath('/admin/events')).toBe('deny');
    expect(framePolicyForPath('/employee/schedule')).toBe('deny');
    expect(framePolicyForPath('/login')).toBe('deny');
  });
  it('allows the public booking page to be embedded (iframe fallback)', () => {
    expect(framePolicyForPath('/book')).toBe('embeddable');
    expect(framePolicyForPath('/book/aurora')).toBe('embeddable');
    expect(framePolicyForPath('/book/aurora/manage')).toBe('embeddable');
  });
  it('defaults everything else to same-origin', () => {
    expect(framePolicyForPath('/')).toBe('sameorigin');
    expect(framePolicyForPath('/api/health')).toBe('sameorigin');
  });
  it('does not treat a lookalike prefix as protected', () => {
    expect(framePolicyForPath('/admin-tools')).toBe('sameorigin');
    expect(framePolicyForPath('/bookings-info')).toBe('sameorigin');
  });
});

describe('buildSecurityHeaders', () => {
  it('always includes the baseline headers', () => {
    const h = buildSecurityHeaders({ frame: 'sameorigin' });
    for (const k of Object.keys(BASELINE_SECURITY_HEADERS)) expect(h[k]).toBe(BASELINE_SECURITY_HEADERS[k]);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it('denies framing with both X-Frame-Options and CSP', () => {
    const h = buildSecurityHeaders({ frame: 'deny' });
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Content-Security-Policy']).toBe("frame-ancestors 'none'");
  });

  it('same-origin framing', () => {
    const h = buildSecurityHeaders({ frame: 'sameorigin' });
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(h['Content-Security-Policy']).toBe("frame-ancestors 'self'");
  });

  it('embeddable framing omits X-Frame-Options and allows any ancestor', () => {
    const h = buildSecurityHeaders({ frame: 'embeddable' });
    expect(h['X-Frame-Options']).toBeUndefined();
    expect(h['Content-Security-Policy']).toBe('frame-ancestors *');
  });

  it('emits HSTS only when requested', () => {
    expect(buildSecurityHeaders({ frame: 'deny' })['Strict-Transport-Security']).toBeUndefined();
    const h = buildSecurityHeaders({ frame: 'deny', hsts: true });
    expect(h['Strict-Transport-Security']).toContain('max-age=');
    expect(h['Strict-Transport-Security']).toContain('includeSubDomains');
  });
});
