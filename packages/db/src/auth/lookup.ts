import { prisma } from '../client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  businessId: string;
  businessSlug: string;
  passwordHash: string | null;
  roles: string[];
  permissions: string[];
}

/**
 * Resolve a user for authentication, aggregating their roles and effective
 * permissions. Users are unique per (businessId, email), so when multiple
 * businesses share an email the caller must disambiguate with a businessSlug.
 * Returns null when not found or ambiguous (callers treat both as auth failure).
 */
export async function findUserForAuth(
  email: string,
  businessSlug?: string,
): Promise<AuthUser | null> {
  const users = await prisma.user.findMany({
    where: {
      email,
      isActive: true,
      ...(businessSlug ? { business: { slug: businessSlug } } : {}),
    },
    include: {
      business: { select: { slug: true } },
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });

  if (users.length !== 1) return null; // not found or ambiguous
  const user = users[0]!;

  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(
      user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    businessId: user.businessId,
    businessSlug: user.business.slug,
    passwordHash: user.passwordHash,
    roles,
    permissions,
  };
}
