import Link from 'next/link';

export function Brand({ businessSlug }: { businessSlug?: string }) {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-4 py-4">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
        A
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">Aurora</span>
        {businessSlug ? (
          <span className="text-[11px] text-muted-foreground">{businessSlug}</span>
        ) : null}
      </span>
    </Link>
  );
}
