import { prisma } from '../client';
import type { PrismaClient } from '@prisma/client';

/**
 * Business (tenant) lookup. Not businessId-scoped itself - it resolves the
 * tenant. Once you hold a business, construct the scoped repositories with its id.
 */
export class BusinessRepository {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient = prisma) {
    this.db = db;
  }

  getById(id: string) {
    return this.db.business.findUnique({ where: { id } });
  }

  getBySlug(slug: string) {
    return this.db.business.findUnique({ where: { slug } });
  }

  /** Resolve the tenant for a widget request via a website public key. */
  getByPublicKey(publicKey: string) {
    return this.db.website.findUnique({
      where: { publicKey },
      include: { business: true },
    });
  }
}
