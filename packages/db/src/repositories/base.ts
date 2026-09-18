import { prisma } from '../client';
import type { PrismaClient } from '@prisma/client';

/**
 * Base for all business-scoped repositories.
 *
 * Every repository is constructed with a businessId and MUST include it in every
 * query's where-clause. This is the central enforcement point for tenant
 * isolation - domain/API code never issues an unscoped Prisma query. The
 * `scope()` helper merges the businessId into any where object so subclasses
 * cannot forget it.
 */
export abstract class BaseRepository {
  protected readonly db: PrismaClient;
  protected readonly businessId: string;

  constructor(businessId: string, db: PrismaClient = prisma) {
    if (!businessId) {
      throw new Error('BaseRepository requires a businessId for tenant scoping.');
    }
    this.businessId = businessId;
    this.db = db;
  }

  /** Merge the bound businessId into a where-clause. */
  protected scope<T extends Record<string, unknown>>(where?: T): T & { businessId: string } {
    return { ...(where ?? ({} as T)), businessId: this.businessId };
  }
}
