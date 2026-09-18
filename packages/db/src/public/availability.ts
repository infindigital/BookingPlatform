import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { getAvailability, type AvailabilityResult } from '../availability/availability';

/**
 * Public availability lookup, resolved by business `slug`. Thin wrapper over the
 * tenant-scoped availability engine so the slug → businessId resolution stays in
 * the data layer (the public page never sees an internal id it didn't need).
 */

export interface PublicAvailabilityParams {
  slug: string;
  serviceId: string;
  employeeId?: string | null;
  fromDayKey: string;
  toDayKey: string;
  now?: Date;
  stepMinutes?: number;
  minLeadMinutes?: number;
}

export async function getPublicAvailability(
  params: PublicAvailabilityParams,
  db: PrismaClient = prisma,
): Promise<AvailabilityResult | null> {
  const business = await db.business.findUnique({
    where: { slug: params.slug },
    select: { id: true, timezone: true },
  });
  if (!business) return null;

  return getAvailability(
    business.id,
    {
      serviceId: params.serviceId,
      employeeId: params.employeeId ?? null,
      fromDayKey: params.fromDayKey,
      toDayKey: params.toDayKey,
      timeZone: business.timezone || 'UTC',
      now: params.now,
      stepMinutes: params.stepMinutes,
      minLeadMinutes: params.minLeadMinutes,
    },
    db,
  );
}
