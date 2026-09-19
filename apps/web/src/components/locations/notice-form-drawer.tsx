'use client';

import { useActionState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import {
  createNoticeAction,
  updateNoticeAction,
  type NoticeActionState,
} from '@/server/locations/actions';

export interface NoticeEditSeed {
  id: string;
  locationId: string | null;
  title: string | null;
  message: string;
  level: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

/** A location the notice can be scoped to. */
export interface NoticeLocationOption {
  id: string;
  name: string;
}

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'info', label: 'Info · neutral note' },
  { value: 'warning', label: 'Important · draws attention' },
  { value: 'critical', label: 'Urgent · strongest emphasis' },
];

/** ISO string -> "YYYY-MM-DDTHH:mm" for a datetime-local input (or empty). */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

export function NoticeFormDrawer({
  open,
  onOpenChange,
  seed,
  locations,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present -> edit mode; null -> create mode. */
  seed: NoticeEditSeed | null;
  /** Locations a notice can be scoped to (empty selection = business-wide). */
  locations: NoticeLocationOption[];
  onSaved: () => void;
}) {
  const isEdit = !!seed;
  const [state, action, pending] = useActionState<NoticeActionState, FormData>(
    isEdit ? updateNoticeAction : createNoticeAction,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.noticeId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[28rem] max-w-[95vw] p-0">
        {open ? (
          <form action={action} className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-border p-5">
              <SheetTitle className="text-base font-semibold">
                {isEdit ? 'Edit notice' : 'New notice'}
              </SheetTitle>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close">
                  <X />
                </Button>
              </SheetClose>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {isEdit ? <input type="hidden" name="noticeId" value={seed!.id} /> : null}

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Applies to</span>
                <select name="locationId" defaultValue={seed?.locationId ?? ''} className={CONTROL}>
                  <option value="">All locations (business-wide)</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Business-wide notices show for every location; a specific location shows only when that location is chosen.
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Title</span>
                <input
                  name="title"
                  defaultValue={seed?.title ?? ''}
                  className={CONTROL}
                  placeholder="e.g. Important location notice"
                  maxLength={160}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Message *</span>
                <textarea
                  name="message"
                  required
                  rows={4}
                  defaultValue={seed?.message ?? ''}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="What customers need to know before booking here."
                  maxLength={1000}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Emphasis</span>
                <select name="level" defaultValue={seed?.level ?? 'info'} className={CONTROL}>
                  {LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Show from</span>
                  <input
                    type="datetime-local"
                    name="startsAt"
                    defaultValue={toLocalInput(seed?.startsAt ?? null)}
                    className={CONTROL}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Show until</span>
                  <input
                    type="datetime-local"
                    name="endsAt"
                    defaultValue={toLocalInput(seed?.endsAt ?? null)}
                    className={CONTROL}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave the dates empty to show the notice indefinitely while it is active.
              </p>

              <label className="flex items-center gap-2.5 border border-border bg-muted/30 p-3">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={seed ? seed.isActive : true}
                  className="size-4 rounded border-border accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">Active</span>
                  <span className="block text-xs text-muted-foreground">
                    Inactive notices are hidden from customers regardless of dates.
                  </span>
                </span>
              </label>

              {state.error ? (
                <p
                  role="alert"
                  className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {state.error}
                </p>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create notice'}
              </Button>
            </footer>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
