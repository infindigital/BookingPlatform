'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Megaphone, Pencil, Trash2, Info, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { NoticeRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { NoticeFormDrawer, type NoticeEditSeed, type NoticeLocationOption } from './notice-form-drawer';
import { deleteNoticeAction } from '@/server/locations/actions';

const LEVEL_META: Record<string, { label: string; Icon: typeof Info; className: string }> = {
  info: { label: 'Info', Icon: Info, className: 'border-primary/40 bg-primary/10 text-primary' },
  warning: { label: 'Important', Icon: AlertTriangle, className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  critical: { label: 'Urgent', Icon: AlertOctagon, className: 'border-destructive/40 bg-destructive/10 text-destructive' },
};

function levelMeta(level: string | null) {
  return LEVEL_META[level ?? 'info'] ?? LEVEL_META.info!;
}

/** "YYYY-MM-DDTHH:mm..." -> "Mon D, YYYY" short label. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function windowLabel(startsAt: string | null, endsAt: string | null): string | null {
  const from = shortDate(startsAt);
  const to = shortDate(endsAt);
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return null;
}

export function LocationNotices({
  notices,
  locations,
}: {
  notices: NoticeRow[];
  locations: NoticeLocationOption[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [seed, setSeed] = useState<NoticeEditSeed | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setSeed(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function openEdit(n: NoticeRow) {
    setSeed({
      id: n.id,
      locationId: n.locationId,
      title: n.title,
      message: n.message,
      level: n.level,
      startsAt: n.startsAt,
      endsAt: n.endsAt,
      isActive: n.isActive,
    });
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function onSaved() {
    setFormOpen(false);
    router.refresh();
  }

  function removeNotice(n: NoticeRow) {
    if (!confirm(`Delete this notice? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteNoticeAction({ noticeId: n.id });
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Could not delete the notice.');
    });
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Location notices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Banners shown to customers during booking. Scope one to a location, or make it business-wide.
          </p>
        </div>
        <Button variant="outline" onClick={openCreate}>
          <Plus aria-hidden /> New notice
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {notices.length === 0 ? (
        <div className="rounded-none border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <Megaphone className="mx-auto mb-2 size-6 opacity-50" />
          No notices yet. Add one to show a message on the booking page.
        </div>
      ) : (
        <ul className="space-y-2">
          {notices.map((n) => {
            const meta = levelMeta(n.level);
            const Icon = meta.Icon;
            const when = windowLabel(n.startsAt, n.endsAt);
            return (
              <li key={n.id} className="flex items-start gap-3 rounded-none border border-border bg-card p-4">
                <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center border ${meta.className}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.title ? <p className="font-medium">{n.title}</p> : null}
                    <span className="inline-flex items-center rounded-none border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {n.locationName ?? 'Business-wide'}
                    </span>
                    {!n.isActive ? (
                      <span className="inline-flex items-center rounded-none bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.message}</p>
                  {when ? <p className="mt-1 text-xs text-muted-foreground">{when}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="Edit notice" onClick={() => openEdit(n)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete notice"
                    disabled={pending}
                    onClick={() => removeNotice(n)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NoticeFormDrawer
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        seed={seed}
        locations={locations}
        onSaved={onSaved}
      />
    </section>
  );
}
