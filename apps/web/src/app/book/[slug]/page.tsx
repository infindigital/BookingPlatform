import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicBookingData } from '@booking/db';
import { BookingWizard } from '@/components/public/booking-wizard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBookingData(slug);
  if (!data) return { title: 'Booking' };
  return {
    title: `Book · ${data.business.name}`,
    description: `Book an appointment with ${data.business.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicBookingData(slug);
  if (!data) notFound();

  return (
    <main className="min-h-dvh bg-muted/30">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-14">
        <BookingWizard data={data} slug={slug} />
      </div>
    </main>
  );
}
