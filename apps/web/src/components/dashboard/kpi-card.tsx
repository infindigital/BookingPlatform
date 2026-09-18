import type { LucideIcon } from 'lucide-react';

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Optional accent for the icon chip (e.g. attention on pending approvals). */
  accent?: 'default' | 'warning' | 'success';
}

const CHIP: Record<NonNullable<KpiCardProps['accent']>, string> = {
  default: 'bg-gradient-to-br from-primary to-[hsl(var(--aurora-2))] text-primary-foreground',
  warning: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
  success: 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white',
};

export function KpiCard({ label, value, hint, icon: Icon, accent = 'default' }: KpiCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border-gradient p-5 shadow-premium transition-transform duration-200 hover:-translate-y-0.5">
      <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-primary/5 blur-2xl transition-opacity group-hover:opacity-80" />
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={`flex size-9 items-center justify-center rounded-xl shadow-sm ${CHIP[accent]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="relative mt-3 text-3xl font-extrabold tracking-tight tabular-nums">{value}</div>
      {hint ? <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
