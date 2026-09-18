'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Search, Users, X } from 'lucide-react';
import type { CustomerListRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { formatMoney, formatRelative, initials } from '@/components/dashboard/format';
import { CustomerDetailDrawer, type CustomerEditSeed } from './customer-detail-drawer';
import { CustomerFormDrawer } from './customer-form-drawer';

export function CustomersWorkspace({
  rows,
  total,
  page,
  pageSize,
  search,
  timeZone,
  canWrite,
}: {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  timeZone: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [searchDraft, setSearchDraft] = useState(search);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formSeed, setFormSeed] = useState<CustomerEditSeed | null>(null);
  const [formKey, setFormKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const go = (patch: { search?: string; page?: number }) => {
    const nextSearch = patch.search ?? search;
    const nextPage = patch.page ?? 1;
    const params = new URLSearchParams();
    if (nextSearch) params.set('search', nextSearch);
    if (nextPage > 1) params.set('page', String(nextPage));
    const qs = params.toString();
    router.push(qs ? `/admin/customers?${qs}` : '/admin/customers');
  };

  function openDetail(id: string) {
    setDetailId(id);
    setDetailOpen(true);
  }
  function openCreate() {
    setFormSeed(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function openEdit(seed: CustomerEditSeed) {
    setDetailOpen(false);
    setFormSeed(seed);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function onSaved(customerId: string) {
    setFormOpen(false);
    router.refresh();
    openDetail(customerId);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Search, review history and manage your customers.</p>
        </div>
        {canWrite ? (
          <Button onClick={openCreate}>
            <Plus aria-hidden /> New customer
          </Button>
        ) : null}
      </header>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ search: searchDraft.trim(), page: 1 });
        }}
        className="relative max-w-sm"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search name, email or phone…"
          className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {searchDraft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setSearchDraft('');
              go({ search: '', page: 1 });
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Customer</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Phone</th>
              <th className="px-4 py-2.5">Bookings</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Last visit</th>
              <th className="px-4 py-2.5 text-right">Lifetime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 size-6 opacity-50" />
                  {search ? 'No customers match your search.' : 'No customers yet.'}
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(c.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{c.bookingsCount}</span>
                    {c.upcomingCount > 0 ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {c.upcomingCount} upcoming
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {c.lastVisitISO ? formatRelative(new Date(c.lastVisitISO)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(c.totalSpent, c.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
              <ChevronLeft /> Prev
            </Button>
            <span className="px-2 text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => go({ page: page + 1 })}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}

      <CustomerDetailDrawer
        customerId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        timeZone={timeZone}
        canWrite={canWrite}
        onEdit={openEdit}
      />
      <CustomerFormDrawer key={formKey} open={formOpen} onOpenChange={setFormOpen} seed={formSeed} onSaved={onSaved} />
    </div>
  );
}
