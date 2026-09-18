import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicBookingData } from '@booking/db';
import { themeCssVars } from '@booking/core';
import { ManagePanel } from '@/components/public/manage-panel';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBookingData(slug);
  return { title: data ? `Manage · ${data.business.name}` : 'Manage booking', robots: { index: false, follow: false } };
}

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ email?: string; ref?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const data = await getPublicBookingData(slug);
  if (!data) notFound();

  const themeStyle = themeCssVars(data.form.theme) as CSSProperties;

  return (
    <main className="min-h-dvh bg-muted/30" style={themeStyle}>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-14">
        <ManagePanel
          slug={slug}
          businessName={data.business.name}
          initialEmail={typeof query.email === 'string' ? query.email : ''}
          initialReference={typeof query.ref === 'string' ? query.ref : ''}
        />
      </div>
    </main>
  );
}
