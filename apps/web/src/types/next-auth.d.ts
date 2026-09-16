import type { DefaultSession } from 'next-auth';

/** Augment the session + user with tenant + RBAC context. */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      businessId: string;
      businessSlug: string;
      roles: string[];
      permissions: string[];
    } & DefaultSession['user'];
  }

  interface User {
    businessId: string;
    businessSlug: string;
    roles: string[];
    permissions: string[];
  }
}
