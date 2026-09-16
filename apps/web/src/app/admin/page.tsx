import type { Metadata } from 'next';
import { hasPermission } from '@booking/core';
import { auth } from '@/server/auth';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string }>;
}) {
  const session = (await auth())!; // layout guard guarantees a session
  const { forbidden } = await searchParams;
  const user = session.user;
  const canApprove = hasPermission(user.permissions, 'booking.approve');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You are signed in. This is the Phase 3 protected area — the premium dashboard
        arrives in Phase 5.
      </p>

      {forbidden ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          You don&apos;t have permission to view that page.
        </p>
      ) : null}

      <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Business</dt>
          <dd className="mt-1 text-sm font-medium">{user.businessSlug}</dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Roles</dt>
          <dd className="mt-1 text-sm font-medium">{user.roles.join(', ') || '—'}</dd>
        </div>
      </dl>

      <section className="mt-6">
        <h2 className="text-sm font-medium">Effective permissions</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {user.permissions.map((p) => (
            <li
              key={p}
              className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground"
            >
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">RBAC demo — pending approvals</h2>
        {canApprove ? (
          <p className="mt-1 text-sm text-muted-foreground">
            You have <span className="font-mono">booking.approve</span> — approval controls
            would appear here.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Your role cannot approve bookings — this section is hidden for you.
          </p>
        )}
      </section>
    </div>
  );
}
