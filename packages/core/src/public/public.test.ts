import { describe, it, expect } from 'vitest';
import { originHost, normalizeDomain, originAllowed, resolveAllowedOrigin, RateLimiter } from './index';

describe('originHost', () => {
  it('extracts the lowercased host', () => {
    expect(originHost('https://Shop.Acme.com')).toBe('shop.acme.com');
    expect(originHost('http://localhost:3000')).toBe('localhost');
  });
  it('rejects junk and the literal "null" origin', () => {
    expect(originHost('null')).toBeNull();
    expect(originHost('not a url')).toBeNull();
    expect(originHost('')).toBeNull();
  });
});

describe('normalizeDomain', () => {
  it('tolerates a bare host, a URL or a host:port', () => {
    expect(normalizeDomain('acme.com')).toBe('acme.com');
    expect(normalizeDomain('https://acme.com/book')).toBe('acme.com');
    expect(normalizeDomain('ACME.com:443')).toBe('acme.com');
  });
  it('is null for empty', () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain('   ')).toBeNull();
  });
});

describe('originAllowed', () => {
  it('allows any origin when no domain is configured (fully public key)', () => {
    expect(originAllowed('https://anywhere.example', null)).toBe(true);
    expect(originAllowed('https://anywhere.example', '')).toBe(true);
  });
  it('allows a request with no Origin (non-browser / server-to-server)', () => {
    expect(originAllowed(null, 'acme.com')).toBe(true);
    expect(originAllowed(undefined, 'acme.com')).toBe(true);
  });
  it('matches the configured domain regardless of scheme', () => {
    expect(originAllowed('https://acme.com', 'acme.com')).toBe(true);
    expect(originAllowed('http://acme.com', 'acme.com')).toBe(true);
  });
  it('treats www and apex as equivalent', () => {
    expect(originAllowed('https://www.acme.com', 'acme.com')).toBe(true);
    expect(originAllowed('https://acme.com', 'www.acme.com')).toBe(true);
  });
  it('rejects a different host', () => {
    expect(originAllowed('https://evil.example', 'acme.com')).toBe(false);
    expect(originAllowed('https://acme.com.evil.example', 'acme.com')).toBe(false);
  });
});

describe('resolveAllowedOrigin', () => {
  it('returns * for an open key', () => {
    expect(resolveAllowedOrigin('https://anywhere.example', null)).toBe('*');
  });
  it('echoes the specific origin for a domain-locked key', () => {
    expect(resolveAllowedOrigin('https://www.acme.com', 'acme.com')).toBe('https://www.acme.com');
  });
  it('returns null when the origin is present but not allowed', () => {
    expect(resolveAllowedOrigin('https://evil.example', 'acme.com')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit, then blocks within the window', () => {
    let t = 1_000;
    const rl = new RateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect(rl.check('k').allowed).toBe(true);
    expect(rl.check('k').allowed).toBe(true);
    const third = rl.check('k');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(rl.check('k').allowed).toBe(false);
  });

  it('resets after the window elapses', () => {
    let t = 0;
    const rl = new RateLimiter({ limit: 1, windowMs: 1_000, now: () => t });
    expect(rl.check('k').allowed).toBe(true);
    expect(rl.check('k').allowed).toBe(false);
    t = 1_000; // window boundary
    expect(rl.check('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    let t = 0;
    const rl = new RateLimiter({ limit: 1, windowMs: 1_000, now: () => t });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  it('bounds memory by evicting when over maxKeys', () => {
    let t = 0;
    const rl = new RateLimiter({ limit: 5, windowMs: 1_000, now: () => t, maxKeys: 2 });
    rl.check('a');
    t = 10;
    rl.check('b');
    t = 20;
    rl.check('c'); // triggers eviction; still functions
    expect(rl.check('c').allowed).toBe(true);
  });
});
