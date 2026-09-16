import { prisma } from './client';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface AuditInput {
  businessId: string;
  action: string; // e.g. "auth.login", "booking.accept"
  actorUserId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * Append an audit record. Best-effort: auditing must never break the primary
 * action, so failures are swallowed after logging. Every sensitive action
 * (auth, approvals, config changes) should call this.
 */
export async function writeAudit(input: AuditInput, db: PrismaClient = prisma): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        businessId: input.businessId,
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        ip: input.ip ?? null,
      },
    });
  } catch {
    // Intentionally non-fatal.
  }
}
