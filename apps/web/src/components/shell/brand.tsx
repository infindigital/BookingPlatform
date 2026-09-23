import Link from 'next/link';

/**
 * Dashboard brand mark. Inside the admin shell we show the business name as
 * plain text (no logo image), which stays legible in both light and dark
 * sidebars. The logo image is reserved for the marketing surfaces (landing
 * hero, login panel).
 */
export function Brand({ businessSlug }: { businessSlug?: string }) {
  return (
    <Link href="/admin" className="flex flex-col gap-0.5 px-4 py-4">
      <span className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
        Midwest Identity Services
      </span>
      {businessSlug ? <span className="text-[11px] text-muted-foreground">{businessSlug}</span> : null}
    </Link>
  );
}
