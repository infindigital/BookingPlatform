import type { LucideIcon } from 'lucide-react';
import { Card } from '@booking/ui/card';

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Optional accent for the icon chip (e.g. attention on pending approvals). */
  accent?: 'default' | 'warning' | 'success';
}

const ACCENT: Record<NonNullable<KpiCardProps['accent']>, string> = {
  default: 'bg-muted text-muted-foreground',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

export function KpiCard({ label, value, hint, icon: Icon, accent = 'default' }: KpiCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={`flex size-8 items-center justify-center rounded-lg ${ACCENT[accent]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
