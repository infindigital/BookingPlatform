import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicBookingData } from '@booking/db';
import { themeCssVars } from '@booking/core';
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

  // Config-driven branding: the business's saved theme becomes CSS variables that
  // override the design-system defaults for this page only.
  const themeStyle = themeCssVars(data.form.theme) as CSSProperties;

  return (
    <main className="relative min-h-dvh bg-background font-sans text-foreground" style={themeStyle}>
      {/* Soft, brand-aware glow derived from the business's own primary color. */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background:
            'radial-gradient(55rem 40rem at 50% -8%, hsl(var(--primary) / 0.14), transparent 60%), radial-gradient(40rem 30rem at 100% 100%, hsl(var(--primary) / 0.08), transparent 60%)',
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <BookingWizard data={data} slug={slug} />
      </div>
    </main>
  );
}
