import type { LucideIcon } from 'lucide-react';

export type KpiTone = 'violet' | 'amber' | 'emerald' | 'fuchsia' | 'sky';

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Vivid gradient theme for the icon orb, glow and meter. */
  tone?: KpiTone;
  /** Optional 0..1 progress meter (e.g. utilization). Rendered as a gradient bar. */
  meter?: number | null;
}

interface ToneStyle {
  orb: string; // gradient for the icon orb
  glow: string; // soft blurred glow behind the card
  meter: string; // gradient for the meter fill
  text: string; // themed accent text for the label
}

const TONES: Record<KpiTone, ToneStyle> = {
  violet: {
    orb: 'from-indigo-500 to-violet-500',
    glow: 'bg-violet-500/25',
    meter: 'from-indigo-500 to-violet-500',
    text: 'text-violet-600 dark:text-violet-300',
  },
  amber: {
    orb: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-500/25',
    meter: 'from-amber-400 to-orange-500',
    text: 'text-amber-600 dark:text-amber-300',
  },
  emerald: {
    orb: 'from-emerald-400 to-teal-500',
    glow: 'bg-emerald-500/25',
    meter: 'from-emerald-400 to-teal-500',
    text: 'text-emerald-600 dark:text-emerald-300',
  },
  fuchsia: {
    orb: 'from-fuchsia-500 to-purple-600',
    glow: 'bg-fuchsia-500/25',
    meter: 'from-fuchsia-500 to-purple-600',
    text: 'text-fuchsia-600 dark:text-fuchsia-300',
  },
  sky: {
    orb: 'from-sky-400 to-cyan-500',
    glow: 'bg-sky-500/25',
    meter: 'from-sky-400 to-cyan-500',
    text: 'text-sky-600 dark:text-sky-300',
  },
};

export function KpiCard({ label, value, hint, icon: Icon, tone = 'violet', meter }: KpiCardProps) {
  const t = TONES[tone];
  const pct = meter === null || meter === undefined ? null : Math.max(0, Math.min(1, meter));

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-premium">
      {/* Soft themed glow that intensifies on hover. */}
      <span
        className={`pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90 ${t.glow}`}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-2">
        <span
          className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${t.orb} text-white shadow-lg ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105`}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${t.text}`}>{label}</p>
      </div>

      <div className="relative mt-4 text-[2.15rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? <p className="relative mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}

      {pct !== null ? (
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={`block h-full rounded-full bg-gradient-to-r ${t.meter} transition-all duration-500`}
            style={{ width: `${Math.round(pct * 100)}%` }}
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}
