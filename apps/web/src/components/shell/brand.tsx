import Link from 'next/link';
import { Logo } from './logo';

export function Brand({ businessSlug }: { businessSlug?: string }) {
  return (
    <Link href="/admin" className="flex flex-col gap-1 px-4 py-4">
      <Logo className="h-7 w-auto" priority />
      {businessSlug ? (
        <span className="text-[11px] text-muted-foreground">{businessSlug}</span>
      ) : null}
    </Link>
  );
}
