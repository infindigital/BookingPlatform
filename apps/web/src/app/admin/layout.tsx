import { requireSession } from '@/server/auth/guard';
import { SignOutButton } from './sign-out-button';

/**
 * Protected admin shell (Phase 3 minimal version — the premium app shell with
 * sidebar, command palette, etc. arrives in Phase 4). Enforces authentication
 * server-side in addition to the edge middleware (defense in depth).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
            A
          </div>
          <span className="text-sm font-medium">{session.user.businessSlug}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}
