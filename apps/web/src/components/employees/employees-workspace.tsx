'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, UserCog, X, Check } from 'lucide-react';
import type { EmployeeListRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { initials } from '@/components/dashboard/format';
import type { EmployeeEditSeed } from './employee-detail-drawer';
import { EmployeeFormDrawer } from './employee-form-drawer';

function weeklyHoursLabel(minutes: number): string {
  if (minutes <= 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m/wk` : `${h}h/wk`;
}

export function EmployeesWorkspace({
  rows,
  total,
  search,
  includeInactive,
  canWrite,
}: {
  rows: EmployeeListRow[];
  total: number;
  search: string;
  includeInactive: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [searchDraft, setSearchDraft] = useState(search);
  const [formOpen, setFormOpen] = useState(false);
  const [formSeed] = useState<EmployeeEditSeed | null>(null);
  const [formKey, setFormKey] = useState(0);

  const go = (patch: { search?: string; inactive?: boolean }) => {
    const nextSearch = patch.search ?? search;
    const nextInactive = patch.inactive ?? includeInactive;
    const params = new URLSearchParams();
    if (nextSearch) params.set('search', nextSearch);
    if (nextInactive) params.set('inactive', '1');
    const qs = params.toString();
    router.push(qs ? `/admin/employees?${qs}` : '/admin/employees');
  };

  function openDetail(id: string) {
    router.push(`/admin/employees/${id}`);
  }
  function openCreate() {
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function onSaved(employeeId: string) {
    setFormOpen(false);
    router.push(`/admin/employees/${employeeId}`);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your team, the services they offer and when they work.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={openCreate}>
            <Plus aria-hidden /> New team member
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ search: searchDraft.trim() });
          }}
          className="relative w-full max-w-sm"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search name, title or email…"
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchDraft ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchDraft('');
                go({ search: '' });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </form>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => go({ inactive: e.target.checked })}
            className="size-4 rounded border-border accent-primary"
          />
          Show inactive
        </label>
      </div>

      <div className="overflow-hidden rounded-none border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Team member</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Services</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Weekly hours</th>
              <th className="px-4 py-2.5">Upcoming</th>
              <th className="px-4 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <UserCog className="mx-auto mb-2 size-6 opacity-50" />
                  {search ? 'No team members match your search.' : 'No team members yet.'}
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => openDetail(e.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          e.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {initials(e.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {e.name}
                          {e.hasLogin ? (
                            <span
                              title="Has a login account"
                              className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                            >
                              Login
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{e.title ?? e.email ?? '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{e.servicesCount}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{weeklyHoursLabel(e.weeklyMinutes)}</td>
                  <td className="px-4 py-3">
                    {e.upcomingCount > 0 ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {e.upcomingCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 ? <p className="text-xs text-muted-foreground">{total} team member{total === 1 ? '' : 's'}</p> : null}

      <EmployeeFormDrawer key={formKey} open={formOpen} onOpenChange={setFormOpen} seed={formSeed} onSaved={onSaved} />
    </div>
  );
}
