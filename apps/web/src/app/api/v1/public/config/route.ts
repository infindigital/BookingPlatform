import { getPublicBookingData } from '@booking/db';
import { guardPublicRequest, apiOk, apiError, preflight } from '@/lib/public-api';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/v1/public/config
 *
 * The widget's bootstrap call: business identity, bookable catalogue
 * (categories / services / team) and the Form Designer theme + settings + steps
 * that drive branding and flow. Key-scoped, CORS-controlled, read-only — no
 * customer records, no internal ids beyond what a visitor needs to book.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const guard = await guardPublicRequest(request, url, 'read');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  try {
    const data = await getPublicBookingData(ctx.website.slug);
    if (!data) return apiError('Booking configuration unavailable.', 404, ctx.origin, ctx.website.domain);

    return apiOk(
      {
        business: {
          name: data.business.name,
          timezone: data.business.timezone,
          currency: data.business.currency,
          email: data.business.email,
          phone: data.business.phone,
        },
        categories: data.categories,
        services: data.services,
        employees: data.employees,
        theme: data.form.theme,
        settings: data.form.settings,
        steps: data.form.steps,
      },
      ctx,
    );
  } catch (error) {
    logger.error('public.config.failed', { key: ctx.website.websiteId, message: (error as Error)?.message });
    return apiError('Unable to load configuration.', 500, ctx.origin, ctx.website.domain);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
