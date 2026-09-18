import type { LucideIcon } from 'lucide-react';

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Optional accent for the icon chip (e.g. attention on pending approvals). */
  accent?: 'default' | 'warning' | 'success';
}

const BAR: Record<NonNullable<KpiCardProps['accent']>, string> = {
  default: 'bg-gradient-to-r from-primary to-[hsl(var(--aurora-2))]',
  warning: 'bg-gradient-to-r from-amber-400 to-orange-500',
  success: 'bg-gradient-to-r from-emerald-400 to-teal-500',
};
const CHIP: Record<NonNullable<KpiCardProps['accent']>, string> = {
  default: 'bg-primary/10 text-primary',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

export function KpiCard({ label, value, hint, icon: Icon, accent = 'default' }: KpiCardProps) {
  return (
    <div className="group relative overflow-hidden border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium">
      <span className={`absolute inset-x-0 top-0 h-1 ${BAR[accent]}`} aria-hidden />
      <Icon
        className="pointer-events-none absolute -bottom-4 -right-3 size-24 text-foreground/[0.03]"
        aria-hidden
      />
      <div className="relative flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <span className={`flex size-10 items-center justify-center ${CHIP[accent]}`}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="relative mt-3 text-4xl font-extrabold tracking-tight tabular-nums">{value}</div>
      {hint ? <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
