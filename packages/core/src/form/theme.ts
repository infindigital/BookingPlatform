/**
 * Form Designer — theme tokens and the pure colour math to apply them.
 *
 * A business brands its booking flow with a small, safe set of tokens (a brand
 * colour, a corner radius, a font family). The customer page turns these into
 * CSS custom properties that override the design-system defaults for that page
 * only. All maths here is pure and dependency-free.
 */

export type FormFont = 'system' | 'sans' | 'serif';

export interface FormThemeTokens {
  /** Brand colour as a hex string, e.g. "#4f46e5". */
  primary: string;
  /** CSS length for the corner radius, e.g. "0.625rem". */
  radius: string;
  font: FormFont;
}

export const DEFAULT_FORM_THEME: FormThemeTokens = {
  primary: '#4f46e5',
  radius: '0.625rem',
  font: 'system',
};

/** Named starting points shown in the designer. Values live here (source of truth). */
export const FORM_THEME_PRESETS: Record<string, FormThemeTokens> = {
  aurora: { primary: '#6d5efc', radius: '1rem', font: 'sans' },
  minimal: { primary: '#4f46e5', radius: '0.625rem', font: 'system' },
  noir: { primary: '#111827', radius: '0.25rem', font: 'sans' },
  luxury: { primary: '#8b6d3f', radius: '0.25rem', font: 'serif' },
  modern: { primary: '#0ea5e9', radius: '1rem', font: 'sans' },
  ocean: { primary: '#2563eb', radius: '0.5rem', font: 'sans' },
  medical: { primary: '#0d9488', radius: '0.5rem', font: 'sans' },
  forest: { primary: '#15803d', radius: '0.5rem', font: 'sans' },
  blossom: { primary: '#db2777', radius: '1rem', font: 'sans' },
  sunset: { primary: '#ea580c', radius: '1rem', font: 'sans' },
  editorial: { primary: '#b91c1c', radius: '0rem', font: 'serif' },
};

export const FORM_FONT_STACKS: Record<FormFont, string> = {
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "'Georgia', 'Times New Roman', ui-serif, serif",
};

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Parse a 3- or 6-digit hex string to {r,g,b} (0–255), or null if malformed. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

/**
 * Convert a hex colour to an HSL triple string ("H S% L%") — the exact form the
 * design-system CSS variables expect (they are consumed via `hsl(var(--token))`).
 * Returns null for malformed input.
 */
export function hexToHslTriple(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const H = Math.round(h);
  const S = Math.round(s * 100);
  const L = Math.round(l * 100);
  return `${H} ${S}% ${L}%`;
}

/** Relative luminance (WCAG) of a hex colour, 0 (black) → 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

/**
 * A readable foreground (as an HSL triple) for text/icons placed on the brand
 * colour: near-white on dark brands, near-black on light brands.
 */
export function readableForeground(hex: string): string {
  return luminance(hex) > 0.55 ? '224 32% 12%' : '0 0% 100%';
}

/** Merge possibly-partial/invalid stored tokens onto the defaults. */
export function resolveFormTheme(raw: unknown): FormThemeTokens {
  const t = (raw ?? {}) as Partial<FormThemeTokens>;
  const primary = typeof t.primary === 'string' && parseHex(t.primary) ? normaliseHex(t.primary) : DEFAULT_FORM_THEME.primary;
  const radius = typeof t.radius === 'string' && /^\d*\.?\d+(px|rem|em)$/.test(t.radius.trim()) ? t.radius.trim() : DEFAULT_FORM_THEME.radius;
  const font: FormFont = t.font === 'sans' || t.font === 'serif' || t.font === 'system' ? t.font : DEFAULT_FORM_THEME.font;
  return { primary, radius, font };
}

/** Lower-case, ensure a leading '#', expand 3-digit to 6-digit. */
export function normaliseHex(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return DEFAULT_FORM_THEME.primary;
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

/**
 * The CSS custom properties to apply the theme to a scoped element. Overrides
 * the brand colour (and its readable foreground), the focus ring, the corner
 * radius and the font. Neutrals/background stay on the design-system defaults so
 * light/dark still adapt.
 */
export function themeCssVars(tokens: FormThemeTokens): Record<string, string> {
  const hsl = hexToHslTriple(tokens.primary) ?? hexToHslTriple(DEFAULT_FORM_THEME.primary)!;
  return {
    '--primary': hsl,
    '--primary-foreground': readableForeground(tokens.primary),
    '--ring': hsl,
    '--radius': tokens.radius,
    '--font-sans': FORM_FONT_STACKS[tokens.font],
  };
}
