import type { Metadata } from 'next';
import { getFormConfig, getPublicBookingData, prisma } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { FormDesigner } from '@/components/form-designer/form-designer';

export const metadata: Metadata = { title: 'Form Designer' };

export default async function FormDesignerPage() {
  const session = await requirePermission('settings.manage');
  const businessId = session.user.businessId;

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  const [config, previewData] = await Promise.all([
    getFormConfig(businessId),
    business ? getPublicBookingData(business.slug) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Form Designer</h1>
        <p className="text-sm text-muted-foreground">
          Brand and configure your customer booking flow. Changes preview live and apply to your public booking page.
        </p>
      </header>
      {previewData && business ? (
        <FormDesigner slug={business.slug} initial={config} previewData={previewData} />
      ) : (
        <p className="text-sm text-muted-foreground">Your business could not be loaded.</p>
      )}
    </div>
  );
}
