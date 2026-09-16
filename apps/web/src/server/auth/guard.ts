import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { hasPermission } from '@booking/core';
import { auth } from './index';

/** Require an authenticated session or redirect to login. Use in server components/actions. */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session;
}

/** Require a specific permission; redirect to login if unauthenticated, or to a
 *  forbidden view if the permission is missing. */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await requireSession();
  if (!hasPermission(session.user.permissions, permission)) {
    redirect('/admin?forbidden=1');
  }
  return session;
}
