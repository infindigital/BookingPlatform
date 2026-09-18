'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { WEBHOOK_EVENTS } from '@booking/core';
import type { WebhookListItem } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { createWebhookAction, updateWebhookAction } from '@/server/integrations/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function WebhookFormDrawer({
  webhook,
  open,
  onOpenChange,
  onSaved,
}: {
  webhook: WebhookListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called on success; passes a freshly-created secret to reveal (create only). */
  onSaved: (secret?: string) => void;
}) {
  const editing = !!webhook;
  const [url, setUrl] = useState(webhook?.url ?? '');
  const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
  const [isActive, setIsActive] = useState(webhook?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggleEvent(key: string) {
    setEvents((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = editing
        ? await updateWebhookAction({ id: webhook!.id, url, events, isActive })
        : await createWebhookAction({ url, events });
      if (res.ok) onSaved(res.secret);
      else setError(res.error ?? 'Could not save the endpoint.');
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[34rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div>
            <SheetTitle className="text-base font-semibold">{editing ? 'Edit endpoint' : 'Add endpoint'}</SheetTitle>
            <p className="text-xs text-muted-foreground">Receive a signed POST when a booking event happens.</p>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Endpoint URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/bookings"
              className={`${CONTROL} font-mono text-[13px]`}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-xs text-muted-foreground">Must be a public https:// URL.</span>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Events</span>
            <div className="grid gap-1.5">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev.key} className="flex items-start gap-2.5 rounded-lg border border-border bg-background p-2.5 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={events.includes(ev.key)}
                    onChange={() => toggleEvent(ev.key)}
                    className="mt-0.5 size-4 rounded border-border accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-medium">{ev.key}</span>
                    <span className="block text-xs text-muted-foreground">{ev.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {editing ? (
            <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-border accent-primary" />
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">When off, no deliveries are sent to this endpoint.</span>
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </SheetClose>
          <Button type="button" onClick={save} disabled={pending || !url || events.length === 0} aria-busy={pending}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Create endpoint'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
