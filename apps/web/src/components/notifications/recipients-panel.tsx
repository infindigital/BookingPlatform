'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Pencil, Trash2, Users, Mail, MessageSquare } from 'lucide-react';
import { NOTIFICATION_EVENTS } from '@booking/core';
import type { RecipientRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  createRecipientAction,
  updateRecipientAction,
  deleteRecipientAction,
  type RecipientFormInput,
} from '@/server/notifications/actions';

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const CHANNELS: { value: string; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

type Editor = { mode: 'create' } | { mode: 'edit'; row: RecipientRow };

export function RecipientsPanel({ initial }: { initial: RecipientRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipientRow[]>(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove(row: RecipientRow) {
    if (!confirm(`Remove ${row.name || row.email || row.phone || 'this recipient'}?`)) return;
    setError(null);
    start(async () => {
      const res = await deleteRecipientAction(row.id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      else {
        setRows((rs) => rs.filter((r) => r.id !== row.id));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Extra people notified on booking events, on top of the customer. Leave events or channels empty for all.
        </p>
        <Button size="sm" onClick={() => { setError(null); setEditor({ mode: 'create' }); }}>
          <Plus /> Add recipient
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-none border border-dashed border-border bg-card px-6 py-12 text-center">
          <Users className="mx-auto mb-2 size-7 text-muted-foreground opacity-60" />
          <p className="font-medium">No extra recipients</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Only the customer is notified. Add a staff or owner address to get copies.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name || r.email || r.phone}</span>
                  {!r.isActive ? <Badge tone="neutral">Off</Badge> : null}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {r.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3" /> {r.email}</span> : null}
                  {r.phone ? <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /> {r.phone}</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.channels.length === 0 ? 'All channels' : r.channels.join(', ')}
                  {' · '}
                  {r.events.length === 0 ? 'All events' : `${r.events.length} event${r.events.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setError(null); setEditor({ mode: 'edit', row: r }); }}>
                  <Pencil /> Edit
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" disabled={pending} onClick={() => remove(r)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RecipientEditor
        key={editor ? (editor.mode === 'edit' ? editor.row.id : 'new') : 'closed'}
        editor={editor}
        onOpenChange={(o) => { if (!o) setEditor(null); }}
        onSaved={() => { setEditor(null); router.refresh(); }}
      />
    </div>
  );
}

function RecipientEditor({
  editor,
  onOpenChange,
  onSaved,
}: {
  editor: Editor | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const existing = editor?.mode === 'edit' ? editor.row : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [channels, setChannels] = useState<string[]>(existing?.channels ?? []);
  const [events, setEvents] = useState<string[]>(existing?.events ?? []);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function submit() {
    setError(null);
    if (!email.trim() && !phone.trim()) {
      setError('Enter an email address or a phone number.');
      return;
    }
    const input: RecipientFormInput = {
      name: name.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      channels,
      events,
      isActive,
    };
    start(async () => {
      const res = existing ? await updateRecipientAction(existing.id, input) : await createRecipientAction(input);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save.');
    });
  }

  return (
    <Sheet open={!!editor} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[30rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <SheetTitle className="text-base font-semibold">{existing ? 'Edit recipient' : 'Add recipient'}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={CONTROL} placeholder="Front desk" autoFocus />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CONTROL} placeholder="team@example.com" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Phone</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={CONTROL} placeholder="+18164420295" />
            </label>
          </div>

          <fieldset className="space-y-2 border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Channels</legend>
            <p className="text-xs text-muted-foreground">Leave all unchecked to use every active channel.</p>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={channels.includes(c.value)} onChange={() => toggle(channels, setChannels, c.value)} className="size-4 rounded border-border accent-primary" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2 border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Events</legend>
            <p className="text-xs text-muted-foreground">Leave all unchecked to be notified on every event.</p>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {NOTIFICATION_EVENTS.map((e) => (
                <label key={e.event} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={events.includes(e.event)} onChange={() => toggle(events, setEvents, e.event)} className="size-4 rounded border-border accent-primary" />
                  {e.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-border accent-primary" />
            Active
          </label>

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
          <Button type="button" onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : existing ? 'Save recipient' : 'Add recipient'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
