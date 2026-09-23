import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CalendarPlus, Scissors, Clock, LayoutPanelTop } from 'lucide-react';

type Tone = 'violet' | 'emerald' | 'amber' | 'sky';

interface Action {
  href: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
}

const ORB: Record<Tone, string> = {
  violet: 'from-indigo-500 to-violet-500',
  emerald: 'from-emerald-400 to-teal-500',
  amber: 'from-amber-400 to-orange-500',
  sky: 'from-sky-400 to-cyan-500',
};
const RING: Record<Tone, string> = {
  violet: 'hover:border-violet-400/60',
  emerald: 'hover:border-emerald-400/60',
  amber: 'hover:border-amber-400/60',
  sky: 'hover:border-sky-400/60',
};

const ACTIONS: Action[] = [
  { href: '/admin/bookings', label: 'New booking', sub: 'Add an appointment', icon: CalendarPlus, tone: 'violet' },
  { href: '/admin/services', label: 'Services & prices', sub: 'Edit your catalog', icon: Scissors, tone: 'emerald' },
  { href: '/admin/employees', label: 'Team & hours', sub: 'Availability, breaks', icon: Clock, tone: 'amber' },
  { href: '/admin/form-designer', label: 'Booking form', sub: 'Design & layouts', icon: LayoutPanelTop, tone: 'sky' },
];

export function QuickActions() {
  return (
    <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-premium ${RING[a.tone]}`}
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ORB[a.tone]} text-white shadow-md ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105`}
          >
            <a.icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{a.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{a.sub}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
