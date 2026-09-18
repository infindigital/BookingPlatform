import { describe, it, expect } from 'vitest';
import {
  hexToHslTriple,
  parseHex,
  readableForeground,
  resolveFormTheme,
  normaliseHex,
  themeCssVars,
  DEFAULT_FORM_THEME,
} from './theme';

describe('parseHex', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(parseHex('#4f46e5')).toEqual({ r: 0x4f, g: 0x46, b: 0xe5 });
    expect(parseHex('fff')).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('rejects malformed input', () => {
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#12')).toBeNull();
  });
});

describe('hexToHslTriple', () => {
  it('converts known colours', () => {
    expect(hexToHslTriple('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslTriple('#000000')).toBe('0 0% 0%');
    expect(hexToHslTriple('#ff0000')).toBe('0 100% 50%');
    // Indigo brand default
    expect(hexToHslTriple('#4f46e5')).toBe('243 75% 59%');
  });
  it('returns null for junk', () => {
    expect(hexToHslTriple('not-a-color')).toBeNull();
  });
});

describe('readableForeground', () => {
  it('is dark on light brands and light on dark brands', () => {
    expect(readableForeground('#ffff00')).toBe('224 32% 12%'); // yellow → dark text
    expect(readableForeground('#1e293b')).toBe('0 0% 100%'); // slate → light text
  });
});

describe('resolveFormTheme', () => {
  it('falls back to defaults for invalid values', () => {
    expect(resolveFormTheme({ primary: 'xxx', radius: 'huge', font: 'comic' })).toEqual(DEFAULT_FORM_THEME);
  });
  it('keeps valid values (normalising hex)', () => {
    expect(resolveFormTheme({ primary: '#ABC', radius: '1rem', font: 'serif' })).toEqual({
      primary: '#aabbcc',
      radius: '1rem',
      font: 'serif',
    });
  });
  it('tolerates null / non-objects', () => {
    expect(resolveFormTheme(null)).toEqual(DEFAULT_FORM_THEME);
    expect(resolveFormTheme(undefined)).toEqual(DEFAULT_FORM_THEME);
  });
});

describe('normaliseHex', () => {
  it('expands and lowercases', () => {
    expect(normaliseHex('#ABC')).toBe('#aabbcc');
    expect(normaliseHex('4F46E5')).toBe('#4f46e5');
  });
});

describe('themeCssVars', () => {
  it('emits the overriding custom properties', () => {
    const vars = themeCssVars({ primary: '#4f46e5', radius: '0.5rem', font: 'sans' });
    expect(vars['--primary']).toBe('243 75% 59%');
    expect(vars['--ring']).toBe('243 75% 59%');
    expect(vars['--primary-foreground']).toBe('0 0% 100%');
    expect(vars['--radius']).toBe('0.5rem');
    expect(vars['--font-sans']).toContain('Inter');
  });
});
