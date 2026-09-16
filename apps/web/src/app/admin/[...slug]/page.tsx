import Link from 'next/link';
import { Construction } from 'lucide-react';
import { buttonVariants } from '@booking/ui/button';
import { NAV_ITEMS } from '@/components/shell/nav';

/**
 * Graceful placeholder for admin sections whose real page hasn't been built yet.
 * A concrete route (e.g. app/admin/calendar/page.tsx) added in a later phase
 * takes precedence over this catch-all automatically.
 */
export default async function AdminPlaceholder({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const href = `/admin/${slug.join('/')}`;
  const item = NAV_ITEMS.find((n) => n.href === href);
  const label = item?.label ?? 'This section';
  const Icon = item?.icon ?? Construction;

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/40">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">{label}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {item
          ? `The ${label} workspace arrives in Phase ${item.phase}. The shell, navigation and design system are ready for it.`
          : 'This area is not available yet.'}
      </p>
      <Link href="/admin" className={`mt-6 ${buttonVariants({ variant: 'outline', size: 'sm' })}`}>
        Back to overview
      </Link>
    </div>
  );
}
