import Link from 'next/link';
import { CalendarHeart } from 'lucide-react';

export function Brand({ businessSlug }: { businessSlug?: string }) {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-4 py-4">
      <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(var(--aurora-2))] text-primary-foreground shadow-glow">
        <CalendarHeart className="size-4" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-tight">
          <span className="text-gradient">INFIN</span> Booking
        </span>
        {businessSlug ? (
          <span className="text-[11px] text-muted-foreground">{businessSlug}</span>
        ) : null}
      </span>
    </Link>
  );
}
