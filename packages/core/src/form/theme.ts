/**
 * Form Designer - theme tokens and the pure colour math to apply them.
 *
 * A business brands its booking flow with a small, safe set of tokens (a brand
 * colour, a corner radius, a font family). The customer page turns these into
 * CSS custom properties that override the design-system defaults for that page
 * only. All maths here is pure and dependency-free.
 */

export type FormFont =
  | 'system'
  | 'sans'
  | 'serif'
  | 'poppins'
  | 'montserrat'
  | 'sora'
  | 'grotesk'
  | 'playfair'
  | 'lora'
  | 'dmserif';

/** Overall colour scheme of the booking form surface. */
export type FormSurface = 'light' | 'dark';

export interface FormThemeTokens {
  /** Brand colour as a hex string, e.g. "#4f46e5". Drives accents AND headers. */
  primary: string;
  /** CSS length for the corner radius, e.g. "0.625rem". */
  radius: string;
  font: FormFont;
  /** Light or dark surface for the whole form (backgrounds, cards, text). */
  surface: FormSurface;
}

export const DEFAULT_FORM_THEME: FormThemeTokens = {
  primary: '#4f46e5',
  radius: '0.625rem',
  font: 'system',
  surface: 'light',
};

/** Named starting points shown in the designer. Values live here (source of truth). */
export const FORM_THEME_PRESETS: Record<string, FormThemeTokens> = {
  aurora: { primary: '#6d5efc', radius: '1rem', font: 'sora', surface: 'light' },
  minimal: { primary: '#4f46e5', radius: '0.625rem', font: 'system', surface: 'light' },
  noir: { primary: '#8b5cf6', radius: '0.25rem', font: 'grotesk', surface: 'dark' },
  luxury: { primary: '#b8925a', radius: '0.25rem', font: 'playfair', surface: 'dark' },
  modern: { primary: '#0ea5e9', radius: '1rem', font: 'poppins', surface: 'light' },
  ocean: { primary: '#2563eb', radius: '0.5rem', font: 'montserrat', surface: 'light' },
  medical: { primary: '#0d9488', radius: '0.5rem', font: 'sans', surface: 'light' },
  forest: { primary: '#15803d', radius: '0.5rem', font: 'lora', surface: 'light' },
  blossom: { primary: '#db2777', radius: '1rem', font: 'poppins', surface: 'light' },
  sunset: { primary: '#ea580c', radius: '1rem', font: 'montserrat', surface: 'light' },
  editorial: { primary: '#e11d48', radius: '0rem', font: 'dmserif', surface: 'dark' },
};

export const FORM_FONT_STACKS: Record<FormFont, string> = {
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "'Georgia', 'Times New Roman', ui-serif, serif",
  poppins: "'Poppins', ui-sans-serif, system-ui, sans-serif",
  montserrat: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
  sora: "'Sora', ui-sans-serif, system-ui, sans-serif",
  grotesk: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  playfair: "'Playfair Display', Georgia, ui-serif, serif",
  lora: "'Lora', Georgia, ui-serif, serif",
  dmserif: "'DM Serif Display', Georgia, ui-serif, serif",
};

/** Every valid font key, for validation. */
export const FORM_FONTS = Object.keys(FORM_FONT_STACKS) as FormFont[];

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Parse a 3- or 6-digit hex string to {r,g,b} (0-255), or null if malformed. */
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
 * Convert a hex colour to an HSL triple string ("H S% L%") - the exact form the
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
  const font: FormFont = FORM_FONTS.includes(t.font as FormFont) ? (t.font as FormFont) : DEFAULT_FORM_THEME.font;
  const surface: FormSurface = t.surface === 'dark' || t.surface === 'light' ? t.surface : DEFAULT_FORM_THEME.surface;
  return { primary, radius, font, surface };
}

/** Lower-case, ensure a leading '#', expand 3-digit to 6-digit. */
export function normaliseHex(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return DEFAULT_FORM_THEME.primary;
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

/** Shift an "H S% L%" triple by hue/saturation/lightness deltas (clamped/wrapped). */
export function shiftHslTriple(triple: string, dh: number, ds: number, dl: number): string {
  const m = /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/.exec(triple.trim());
  if (!m) return triple;
  const h = (((Number(m[1]) + dh) % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, Number(m[2]) + ds));
  const l = Math.min(100, Math.max(0, Number(m[3]) + dl));
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Neutral (background/card/text/border) tokens per surface scheme. */
const SURFACE_NEUTRALS: Record<FormSurface, Record<string, string>> = {
  light: {
    '--background': '0 0% 100%',
    '--foreground': '224 32% 12%',
    '--card': '0 0% 100%',
    '--card-foreground': '224 32% 12%',
    '--popover': '0 0% 100%',
    '--popover-foreground': '224 32% 12%',
    '--muted': '220 16% 96%',
    '--muted-foreground': '220 10% 40%',
    '--secondary': '220 16% 96%',
    '--secondary-foreground': '224 24% 20%',
    '--accent': '220 16% 94%',
    '--accent-foreground': '224 24% 20%',
    '--border': '220 16% 90%',
    '--input': '220 16% 90%',
  },
  dark: {
    '--background': '224 32% 8%',
    '--foreground': '220 16% 96%',
    '--card': '224 30% 11%',
    '--card-foreground': '220 16% 96%',
    '--popover': '224 30% 11%',
    '--popover-foreground': '220 16% 96%',
    '--muted': '224 22% 16%',
    '--muted-foreground': '220 12% 65%',
    '--secondary': '224 22% 18%',
    '--secondary-foreground': '220 16% 92%',
    '--accent': '224 22% 20%',
    '--accent-foreground': '220 16% 92%',
    '--border': '224 20% 24%',
    '--input': '224 20% 24%',
  },
};

/**
 * The CSS custom properties to apply the theme to a scoped element. The brand
 * colour drives the accent AND two derived gradient stops (`--brand-1/2`) used
 * by the headers, so changing the colour restyles the WHOLE form, not just the
 * button. The surface scheme swaps the neutral background/card/text tokens.
 */
export function themeCssVars(tokens: FormThemeTokens): Record<string, string> {
  const hsl = hexToHslTriple(tokens.primary) ?? hexToHslTriple(DEFAULT_FORM_THEME.primary)!;
  return {
    ...SURFACE_NEUTRALS[tokens.surface],
    '--primary': hsl,
    '--primary-foreground': readableForeground(tokens.primary),
    '--ring': hsl,
    // Brand-derived gradient stops (headers/heroes read from these).
    '--brand-1': hsl,
    '--brand-2': shiftHslTriple(hsl, 22, 4, 6),
    '--radius': tokens.radius,
    '--font-sans': FORM_FONT_STACKS[tokens.font],
  };
}
