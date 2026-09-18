import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Resolve a publishable widget key (`Website.publicKey`) to the business it
 * embeds. This is the single entry point that turns the untrusted public key a
 * third-party site sends into a tenant identity; every public-API request goes
 * through it before touching any business data.
 *
 * Returns `null` for an unknown or disabled key so the caller answers 404/403
 * without leaking whether the key merely exists. The `slug` lets the API reuse
 * the existing slug-keyed public read/booking functions; `domain` drives CORS.
 */

export interface ResolvedWebsite {
  websiteId: string;
  businessId: string;
  businessName: string;
  slug: string;
  /** Configured host for CORS (null = key is fully public). */
  domain: string | null;
}

export async function resolveWebsiteByPublicKey(
  publicKey: string,
  db: PrismaClient = prisma,
): Promise<ResolvedWebsite | null> {
  const key = publicKey?.trim();
  if (!key) return null;

  const website = await db.website.findFirst({
    where: { publicKey: key, isActive: true },
    select: {
      id: true,
      businessId: true,
      domain: true,
      business: { select: { name: true, slug: true } },
    },
  });
  if (!website) return null;

  return {
    websiteId: website.id,
    businessId: website.businessId,
    businessName: website.business.name,
    slug: website.business.slug,
    domain: website.domain,
  };
}
