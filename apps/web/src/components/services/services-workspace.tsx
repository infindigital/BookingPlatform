'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Scissors, Pencil, Trash2, Tag, AlertTriangle, X } from 'lucide-react';
import type { ServiceRow, ServiceCategoryRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { formatMoney } from '@/components/dashboard/format';
import { ServiceFormDrawer, type ServiceEditSeed } from './service-form-drawer';
import {
  deleteServiceAction,
  createCategoryAction,
  deleteCategoryAction,
  resetBusinessDataAction,
} from '@/server/services/actions';

function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function ServicesWorkspace({
  services,
  categories,
  currency,
  canReset,
}: {
  services: ServiceRow[];
  categories: ServiceCategoryRow[];
  currency: string;
  canReset: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [seed, setSeed] = useState<ServiceEditSeed | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setSeed(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function openEdit(s: ServiceRow) {
    setSeed({
      id: s.id,
      name: s.name,
      description: s.description,
      categoryId: s.categoryId,
      durationMinutes: s.durationMinutes,
      bufferBeforeMinutes: s.bufferBeforeMinutes,
      bufferAfterMinutes: s.bufferAfterMinutes,
      minAdvanceMinutes: s.minAdvanceMinutes,
      maxAdvanceDays: s.maxAdvanceDays,
      slotIntervalMinutes: s.slotIntervalMinutes,
      price: s.price,
      color: s.color,
      isActive: s.isActive,
    });
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function onSaved() {
    setFormOpen(false);
    router.refresh();
  }

  function removeService(s: ServiceRow) {
    if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteServiceAction({ serviceId: s.id });
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Could not delete the service.');
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The services customers can book. Create, price and organise them here.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden /> New service
        </Button>
      </header>

      {error ? (
        <p role="alert" className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Services table */}
      <div className="overflow-hidden rounded-none border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Service</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Category</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Duration</th>
              <th className="px-4 py-2.5">Price</th>
              <th className="hidden px-4 py-2.5 lg:table-cell">Team</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {services.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <Scissors className="mx-auto mb-2 size-6 opacity-50" />
                  No services yet. Click “New service” to create your first one.
                </td>
              </tr>
            ) : (
              services.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 shrink-0 rounded-full border border-border"
                        style={{ background: s.color ?? 'hsl(var(--muted-foreground))' }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {s.name}
                          {!s.isActive ? (
                            <span className="inline-flex items-center rounded-none bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Inactive
                            </span>
                          ) : null}
                        </p>
                        {s.description ? <p className="truncate text-xs text-muted-foreground">{s.description}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{s.categoryName ?? '-'}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{durationLabel(s.durationMinutes)}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(s.price, currency)}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{s.employeeCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${s.name}`}
                        disabled={pending}
                        onClick={() => removeService(s)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CategoriesPanel categories={categories} onChange={() => router.refresh()} />

      {canReset ? <DangerZone onDone={() => router.refresh()} /> : null}

      <ServiceFormDrawer
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        seed={seed}
        categories={categories}
        onSaved={onSaved}
      />
    </div>
  );
}

function CategoriesPanel({
  categories,
  onChange,
}: {
  categories: ServiceCategoryRow[];
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await createCategoryAction({ name: trimmed });
      if (res.ok) {
        setName('');
        onChange();
      } else setError(res.error ?? 'Could not add category.');
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteCategoryAction({ categoryId: id });
      if (res.ok) onChange();
      else setError(res.error ?? 'Could not delete category.');
    });
  }

  return (
    <section className="rounded-none border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Categories</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Group services on the booking form. Deleting a category leaves its services intact.</p>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5 rounded-none border border-border bg-background px-2.5 py-1 text-sm">
            {c.name}
            <span className="text-xs text-muted-foreground">({c.serviceCount})</span>
            <button
              type="button"
              aria-label={`Delete ${c.name}`}
              disabled={pending}
              onClick={() => remove(c.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {categories.length === 0 ? <span className="text-sm text-muted-foreground">No categories yet.</span> : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          maxLength={80}
          className="h-9 w-full max-w-xs rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
          <Plus /> Add
        </Button>
      </form>

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function DangerZone({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await resetBusinessDataAction({ confirm });
      if (res.ok) {
        const s = res.summary;
        setDone(
          s
            ? `Cleared ${s.services} services, ${s.employees} employees, ${s.customers} customers, ${s.bookings} bookings.`
            : 'Workspace cleared.',
        );
        setConfirm('');
        setOpen(false);
        onDone();
      } else {
        setError(res.error ?? 'Could not reset the workspace.');
      }
    });
  }

  return (
    <section className="rounded-none border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-destructive" />
        <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Permanently delete all services, employees, customers, bookings and notification history so you can start from
        scratch. Your login, locations, business hours and form design are kept. This cannot be undone.
      </p>

      {done ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{done}</p> : null}

      {!open ? (
        <Button variant="outline" className="mt-3 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
          <Trash2 /> Clear all data
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            Type <span className="font-mono font-semibold">RESET</span> to confirm:
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 h-9 w-full max-w-xs rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="RESET"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={pending || confirm !== 'RESET'}
              onClick={reset}
            >
              {pending ? 'Clearing…' : 'Permanently clear everything'}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setConfirm('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
