import type { Metadata } from 'next';
import { getFormConfig, getPublicBookingData, prisma, type PublicBookingData, type FormConfigForAdmin } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { FormDesigner } from '@/components/form-designer/form-designer';
import { logger } from '@/lib/logger';

export const metadata: Metadata = { title: 'Form Designer' };

export default async function FormDesignerPage() {
  const session = await requirePermission('settings.manage');
  const businessId = session.user.businessId;

  // Load defensively: a single failing query (e.g. a deployed schema that has
  // drifted behind the code) must not white-screen the whole route. Surface a
  // clear, actionable message to the admin instead of the generic error page.
  let config: FormConfigForAdmin | null = null;
  let previewData: PublicBookingData | null = null;
  let loadError: string | null = null;
  try {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
    if (!business) {
      loadError = 'Your business could not be loaded. Sign out and back in, or re-run the provisioning step.';
    } else {
      [config, previewData] = await Promise.all([getFormConfig(businessId), getPublicBookingData(business.slug)]);
    }
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    logger.error('form-designer.load.failed', { message });
    loadError = message.replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Form Designer</h1>
        <p className="text-sm text-muted-foreground">
          Brand and configure your customer booking flow. Changes preview live and apply to your public booking page.
        </p>
      </header>
      {config && previewData ? (
        <FormDesigner slug={previewData.business.slug} initial={config} previewData={previewData} />
      ) : (
        <div className="rounded-none border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm font-medium text-destructive">The Form Designer could not load.</p>
          {loadError ? <p className="mt-2 font-mono text-xs text-muted-foreground">{loadError}</p> : null}
          <p className="mt-3 text-sm text-muted-foreground">
            This usually means the database schema is behind the app. Re-run the provisioning step
            (<span className="font-mono text-xs">/api/admin/reprovision?token=&lt;AUTH_SECRET&gt;&amp;confirm=reset</span>) and
            reload this page.
          </p>
        </div>
      )}
    </div>
  );
}
