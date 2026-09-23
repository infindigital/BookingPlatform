import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheck, CalendarDays, Gauge, Inbox, Plus, Sparkles, Wallet } from 'lucide-react';
import { hasPermission } from '@booking/core';
import { businessRepository, getDashboardMetrics } from '@booking/db';
import { requireSession } from '@/server/auth/guard';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { TodayTimeline } from '@/components/dashboard/today-timeline';
import { PendingQueue } from '@/components/dashboard/pending-queue';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { formatMoney } from '@/components/dashboard/format';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string }>;
}) {
  const session = await requireSession();
  const { forbidden } = await searchParams;
  const user = session.user;
  const canApprove = hasPermission(user.permissions, 'booking.approve');

  const business = await businessRepository.getById(user.businessId);
  const timeZone = business?.timezone || 'UTC';
  const currency = business?.currency || 'USD';
  const now = new Date();

  const data = await getDashboardMetrics(user.businessId, { now, timeZone });
  const { kpis } = data;

  const firstName = (user.name ?? '').trim().split(/\s+/)[0] || 'there';
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(now);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Vivid aurora hero band */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[hsl(var(--aurora-1))] via-[hsl(var(--aurora-2))] to-[hsl(var(--aurora-4))] p-6 text-white shadow-premium sm:p-8">
        <span
          className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[hsl(var(--aurora-3)/0.45)] blur-3xl"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -bottom-24 -left-10 size-64 rounded-full bg-[hsl(var(--aurora-4)/0.45)] blur-3xl"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur">
              <Sparkles className="size-3.5" aria-hidden />
              {todayLabel}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight drop-shadow-sm sm:text-[2.6rem] sm:leading-[1.05]">
              Welcome back, {firstName}
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/85">
              Here&rsquo;s what&rsquo;s happening at {business?.name ?? 'your business'} today.
            </p>
          </div>
          <Link
            href="/admin/bookings"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[hsl(var(--aurora-1))] shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <Plus className="size-4" aria-hidden />
            New booking
          </Link>
        </div>
      </section>

      <QuickActions />

      {forbidden ? (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          You don&rsquo;t have permission to view that page.
        </p>
      ) : null}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Today"
          value={String(kpis.todayCount)}
          hint="bookings scheduled"
          icon={CalendarDays}
          tone="violet"
        />
        <KpiCard
          label="Pending"
          value={String(kpis.pendingCount)}
          hint="awaiting a decision"
          icon={Inbox}
          tone="amber"
        />
        <KpiCard
          label="Upcoming"
          value={String(kpis.upcomingConfirmedCount)}
          hint="confirmed ahead"
          icon={CalendarCheck}
          tone="emerald"
        />
        <KpiCard
          label="Revenue"
          value={formatMoney(kpis.revenueMonth, currency)}
          hint="confirmed · this month"
          icon={Wallet}
          tone="fuchsia"
        />
        <KpiCard
          label="Utilization"
          value={kpis.utilization === null ? '-' : `${Math.round(kpis.utilization * 100)}%`}
          hint={kpis.utilization === null ? 'closed today' : 'of scheduled hours'}
          icon={Gauge}
          tone="sky"
          meter={kpis.utilization}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodayTimeline bookings={data.today} timeZone={timeZone} />
        </div>
        <div className="space-y-6">
          <PendingQueue bookings={data.pending} timeZone={timeZone} canApprove={canApprove} />
          <ActivityFeed bookings={data.recent} timeZone={timeZone} now={now} />
        </div>
      </div>
    </div>
  );
}
