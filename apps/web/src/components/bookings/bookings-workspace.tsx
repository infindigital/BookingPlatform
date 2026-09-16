'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ChevronLeft, ChevronRight, Filter, Plus, Search, Users } from 'lucide-react';
import type { BookingListRow, BookingFormData, BookingStatus } from '@booking/db';
import { Button } from '@booking/ui/button';
import { cn } from '@booking/ui/lib/cn';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@booking/ui/dropdown-menu';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { formatDay, formatMoney, formatTime } from '@/components/dashboard/format';
import { BookingDetailDrawer } from './booking-detail-drawer';
import { CreateBookingDrawer } from './create-booking-drawer';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'ACCEPTED', label: 'Confirmed' },
  { key: 'RESCHEDULED', label: 'Rescheduled' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'NO_SHOW', label: 'No-show' },
];

const WHEN_LABELS: Record<string, string> = { all: 'All time', upcoming: 'Upcoming', past: 'Past' };

export interface BookingsFilters {
  status: BookingStatus | 'all';
  employeeId: string;
  when: string;
  search: string;
}

export function BookingsWorkspace({
  rows,
  total,
  page,
  pageSize,
  statusCounts,
  filters,
  formData,
  timeZone,
  canApprove,
  canWrite,
}: {
  rows: BookingListRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
  filters: BookingsFilters;
  formData: BookingFormData;
  timeZone: string;
  canApprove: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<BookingListRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // Keep the open drawer in sync with refreshed data after an action so it shows
  // the live status (and updated available actions) without being reopened.
  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((r) => r.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [rows, selected]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const go = (patch: Partial<BookingsFilters & { page: number }>) => {
    const next = {
      status: patch.status ?? filters.status,
      employee: patch.employeeId ?? filters.employeeId,
      when: patch.when ?? filters.when,
      search: patch.search ?? filters.search,
      page: patch.page ?? 1,
    };
    const params = new URLSearchParams();
    if (next.status !== 'all') params.set('status', next.status);
    if (next.employee !== 'all') params.set('employee', next.employee);
    if (next.when !== 'all') params.set('when', next.when);
    if (next.search) params.set('search', next.search);
    if (next.page > 1) params.set('page', String(next.page));
    const qs = params.toString();
    router.push(qs ? `/admin/bookings?${qs}` : '/admin/bookings');
  };

  const openBooking = (b: BookingListRow) => {
    setSelected(b);
    setDetailOpen(true);
  };

  const activeEmployee = formData.employees.find((e) => e.id === filters.employeeId);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, approve and manage every booking.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            New booking
          </Button>
        ) : null}
      </header>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.key] ?? 0;
          const active = filters.status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => go({ status: tab.key as BookingsFilters['status'] })}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ search: searchDraft });
          }}
          className="relative flex-1 sm:max-w-xs"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search customer or service…"
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Users />
              {activeEmployee ? activeEmployee.name : 'All team'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Team member</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go({ employeeId: 'all' })}>All team</DropdownMenuItem>
            {formData.employees.map((e) => (
              <DropdownMenuItem key={e.id} onSelect={() => go({ employeeId: e.id })}>
                {e.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter />
              {WHEN_LABELS[filters.when]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {Object.entries(WHEN_LABELS).map(([key, label]) => (
              <DropdownMenuItem key={key} onSelect={() => go({ when: key })}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <CalendarClock className="size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No bookings match these filters</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Adjust the filters or create a booking.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Service</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Team</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => openBooking(b)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: b.serviceColor ?? 'hsl(var(--primary))' }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.customerName}</p>
                        <p className="truncate text-xs text-muted-foreground sm:hidden">{b.serviceName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{b.serviceName}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {b.employeeName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="whitespace-nowrap">{formatDay(new Date(b.startISO), timeZone)}</span>
                    <span className="block text-xs tabular-nums">{formatTime(new Date(b.startISO), timeZone)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                    {b.priceTotal > 0 ? formatMoney(b.priceTotal, b.currency) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => go({ page: page - 1 })}
            >
              <ChevronLeft />
              Prev
            </Button>
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => go({ page: page + 1 })}
            >
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}

      <BookingDetailDrawer
        booking={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        formData={formData}
        timeZone={timeZone}
        canApprove={canApprove}
        canWrite={canWrite}
      />
      <CreateBookingDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        formData={formData}
        timeZone={timeZone}
      />
    </div>
  );
}
