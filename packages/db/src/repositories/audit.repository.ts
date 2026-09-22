import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base';

export interface AuditFilter {
  action?: string;
  entity?: string;
  actorUserId?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
}

export interface AuditPage {
  rows: AuditRow[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Read-only, business-scoped access to the audit log. Cursor-paginated by id
 * (stable under the created-at ordering) so the viewer can page without gaps.
 */
export class AuditRepository extends BaseRepository {
  async list(filter: AuditFilter = {}): Promise<AuditPage> {
    const take = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const where: Prisma.AuditLogWhereInput = {};
    if (filter.action) where.action = filter.action;
    if (filter.entity) where.entity = filter.entity;
    if (filter.actorUserId) where.actorUserId = filter.actorUserId;

    const rows = await this.db.auditLog.findMany({
      where: this.scope(where),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { actor: { select: { name: true } } },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page[page.length - 1];
    return {
      rows: page.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actorUserId: r.actorUserId,
        actorName: r.actor?.name ?? null,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  /** Distinct action names for the filter dropdown. */
  async distinctActions(): Promise<string[]> {
    const rows = await this.db.auditLog.findMany({
      where: this.scope(),
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
      take: MAX_LIMIT,
    });
    return rows.map((r) => r.action);
  }
}
