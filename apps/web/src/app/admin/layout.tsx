import { requireSession } from '@/server/auth/guard';
import { Brand } from '@/components/shell/brand';
import { SidebarNav } from '@/components/shell/sidebar-nav';
import { Topbar } from '@/components/shell/topbar';

/**
 * Premium responsive admin shell: fixed sidebar on desktop, drawer on mobile,
 * sticky top bar with global search (⌘K), notifications, theme toggle and the
 * account menu. Auth is enforced here (server) in addition to the edge middleware.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { user } = session;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border lg:flex">
        <Brand businessSlug={user.businessSlug} />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <Topbar name={user.name ?? user.email ?? 'User'} email={user.email ?? ''} businessSlug={user.businessSlug} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
