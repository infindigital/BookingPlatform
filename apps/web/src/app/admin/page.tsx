import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheck, CalendarDays, Gauge, Inbox, Plus, Wallet } from 'lucide-react';
import { hasPermission } from '@booking/core';
import { businessRepository, getDashboardMetrics } from '@booking/db';
import { buttonVariants } from '@booking/ui/button';
import { requireSession } from '@/server/auth/guard';
import { KpiCard } from '@/components/dashboard/kpi-card';
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

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&rsquo;s what&rsquo;s happening at {business?.name ?? 'your business'} today.
          </p>
        </div>
        <Link href="/admin/bookings" className={buttonVariants({ variant: 'primary', size: 'md' })}>
          <Plus aria-hidden />
          New booking
        </Link>
      </header>

      {forbidden ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
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
        />
        <KpiCard
          label="Pending"
          value={String(kpis.pendingCount)}
          hint="awaiting a decision"
          icon={Inbox}
          accent={kpis.pendingCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Upcoming"
          value={String(kpis.upcomingConfirmedCount)}
          hint="confirmed ahead"
          icon={CalendarCheck}
          accent="success"
        />
        <KpiCard
          label="Revenue"
          value={formatMoney(kpis.revenueMonth, currency)}
          hint="confirmed · this month"
          icon={Wallet}
        />
        <KpiCard
          label="Utilization"
          value={kpis.utilization === null ? '—' : `${Math.round(kpis.utilization * 100)}%`}
          hint={kpis.utilization === null ? 'closed today' : 'of scheduled hours'}
          icon={Gauge}
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
