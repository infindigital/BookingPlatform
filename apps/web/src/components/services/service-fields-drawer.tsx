'use client';

import { useEffect, useState, useTransition } from 'react';
import { X, Plus, Pencil, Trash2, ListChecks } from 'lucide-react';
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from '@booking/core';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  listServiceFieldsAction,
  createServiceFieldAction,
  updateServiceFieldAction,
  deleteServiceFieldAction,
  type ServiceFieldRow,
} from '@/server/services/field-actions';

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const TYPE_LABEL: Record<CustomFieldType, string> = {
  TEXT: 'Text',
  TEXTAREA: 'Paragraph',
  NUMBER: 'Number',
  SELECT: 'Dropdown',
  CHECKBOX: 'Checkbox',
  RADIO: 'Choice',
  DATE: 'Date',
  PHONE: 'Phone',
  EMAIL: 'Email',
};

function needsOptions(type: CustomFieldType): boolean {
  return type === 'SELECT' || type === 'RADIO';
}

interface Draft {
  id: string | null;
  label: string;
  type: CustomFieldType;
  required: boolean;
  optionsText: string;
  placeholder: string;
}

const EMPTY_DRAFT: Draft = { id: null, label: '', type: 'TEXT', required: false, optionsText: '', placeholder: '' };

export function ServiceFieldsDrawer({
  serviceId,
  serviceName,
  open,
  onOpenChange,
}: {
  serviceId: string | null;
  serviceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<ServiceFieldRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (open && serviceId) {
      setDraft(null);
      setError(null);
      startLoad(async () => {
        setRows(await listServiceFieldsAction(serviceId));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serviceId]);

  function reload() {
    if (serviceId) startLoad(async () => setRows(await listServiceFieldsAction(serviceId)));
  }

  function editRow(r: ServiceFieldRow) {
    setError(null);
    setDraft({
      id: r.id,
      label: r.label,
      type: r.type,
      required: r.required,
      optionsText: r.options.join('\n'),
      placeholder: r.placeholder ?? '',
    });
  }

  function remove(r: ServiceFieldRow) {
    if (!confirm(`Delete the question “${r.label}”?`)) return;
    setError(null);
    startSave(async () => {
      const res = await deleteServiceFieldAction(r.id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      reload();
    });
  }

  function save() {
    if (!draft || !serviceId) return;
    setError(null);
    const input = {
      label: draft.label.trim(),
      type: draft.type,
      required: draft.required,
      options: needsOptions(draft.type) ? draft.optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : [],
      placeholder: draft.placeholder.trim() || null,
    };
    startSave(async () => {
      const res = draft.id
        ? await updateServiceFieldAction(draft.id, input)
        : await createServiceFieldAction(serviceId, input);
      if (res.ok) {
        setDraft(null);
        reload();
      } else {
        setError(res.error ?? 'Could not save.');
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[30rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div className="min-w-0">
            <SheetTitle className="truncate text-base font-semibold">Booking questions</SheetTitle>
            <p className="truncate text-xs text-muted-foreground">{serviceName}</p>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-muted-foreground">
            Extra questions customers answer when booking this service. Answers appear on the booking.
          </p>

          {error ? (
            <p role="alert" className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {rows.length === 0 && !loading ? (
            <div className="rounded-none border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              <ListChecks className="mx-auto mb-2 size-6 opacity-50" />
              No questions yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded-none border border-border bg-card p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.label}</span>
                      <Badge tone="neutral">{TYPE_LABEL[r.type]}</Badge>
                      {r.required ? <Badge tone="info">Required</Badge> : null}
                    </div>
                    {r.options.length > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.options.join(' · ')}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => editRow(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" disabled={saving} onClick={() => remove(r)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {draft ? (
            <div className="space-y-3 border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {draft.id ? 'Edit question' : 'New question'}
              </p>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Label *</span>
                <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={CONTROL} autoFocus />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Type</span>
                  <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })} className={CONTROL}>
                    {CUSTOM_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-1.5 text-sm">
                  <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} className="size-4 rounded border-border accent-primary" />
                  Required
                </label>
              </div>
              {needsOptions(draft.type) ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Options (one per line)</span>
                  <textarea
                    value={draft.optionsText}
                    onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                    rows={3}
                    className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={'Option A\nOption B'}
                  />
                </label>
              ) : (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Placeholder (optional)</span>
                  <input value={draft.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} className={CONTROL} />
                </label>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={save} disabled={saving} aria-busy={saving}>
                  {saving ? 'Saving…' : draft.id ? 'Save question' : 'Add question'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => { setError(null); setDraft({ ...EMPTY_DRAFT }); }}>
              <Plus aria-hidden /> Add question
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
