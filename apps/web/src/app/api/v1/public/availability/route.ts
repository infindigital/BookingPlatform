import { getPublicAvailability } from '@booking/db';
import { guardPublicRequest, apiOk, apiError, preflight } from '@/lib/public-api';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/public/availability?serviceId=&employeeId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns bookable slots for a service (and optional team member) over a date
 * range, computed by the live availability engine (working hours − breaks −
 * time-off − holidays − blocks − existing bookings, with buffers/capacity and
 * the business's min-lead policy). The client never sees why a slot is absent -
 * only the free instants and which team members can take each.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const guard = await guardPublicRequest(request, url, 'read');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const serviceId = url.searchParams.get('serviceId') ?? '';
  const employeeId = url.searchParams.get('employeeId');
  const locationId = url.searchParams.get('locationId');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';

  if (!serviceId) return apiError('serviceId is required.', 400, ctx.origin, ctx.website.domain);
  if (!DAY.test(from) || !DAY.test(to)) {
    return apiError('from and to must be YYYY-MM-DD dates.', 400, ctx.origin, ctx.website.domain);
  }
  if (to < from) return apiError('to must not be before from.', 400, ctx.origin, ctx.website.domain);

  try {
    const result = await getPublicAvailability({
      slug: ctx.website.slug,
      serviceId,
      employeeId: employeeId || null,
      locationId: locationId || null,
      fromDayKey: from,
      toDayKey: to,
      now: new Date(),
    });
    if (!result) return apiError('Availability unavailable.', 404, ctx.origin, ctx.website.domain);

    return apiOk(
      {
        durationMinutes: result.durationMinutes,
        stepMinutes: result.stepMinutes,
        days: result.days.map((d) => ({
          dayKey: d.dayKey,
          slots: d.slots.map((s) => ({ startISO: s.startISO, employeeIds: s.employeeIds })),
        })),
      },
      ctx,
    );
  } catch (error) {
    logger.error('public.availability.failed', { key: ctx.website.websiteId, message: (error as Error)?.message });
    return apiError('Unable to load availability.', 500, ctx.origin, ctx.website.domain);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
