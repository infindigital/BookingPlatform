'use client';

import { useRef, useState, useTransition } from 'react';
import { X, RotateCcw, Eye } from 'lucide-react';
import { renderTemplate, TEMPLATE_VARIABLES } from '@booking/core';
import type { NotificationTemplateConfig } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import {
  saveNotificationTemplateAction,
  resetNotificationTemplateAction,
} from '@/server/notifications/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Sample values so the preview reads like a real message. */
const SAMPLE_VARS: Record<string, string> = {
  'customer.firstName': 'Mia',
  'customer.lastName': 'Thompson',
  'customer.name': 'Mia Thompson',
  'business.name': 'Aurora Studio',
  'service.name': 'Signature Consultation',
  'booking.date': 'Friday, September 25, 2026',
  'booking.time': '2:00 PM',
  'booking.reference': 'D4AP38GE',
  'booking.employee': 'Emma Rivera',
  'booking.price': '$120.00',
};

export function TemplateEditorDrawer({
  template,
  onOpenChange,
  onSaved,
}: {
  template: NotificationTemplateConfig | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const open = !!template;
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(token: string) {
    const ta = bodyRef.current;
    const chip = `{{${token}}}`;
    if (!ta) {
      setBody((b) => b + chip);
      return;
    }
    const startPos = ta.selectionStart ?? body.length;
    const endPos = ta.selectionEnd ?? body.length;
    setBody(body.slice(0, startPos) + chip + body.slice(endPos));
    requestAnimationFrame(() => {
      ta.focus();
      const caret = startPos + chip.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  function save() {
    if (!template) return;
    setError(null);
    start(async () => {
      const res = await saveNotificationTemplateAction({ event: template.event, subject, body, isActive });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save.');
    });
  }

  function reset() {
    if (!template) return;
    setError(null);
    start(async () => {
      const res = await resetNotificationTemplateAction({ event: template.event });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not reset.');
    });
  }

  const previewSubject = renderTemplate(subject, SAMPLE_VARS);
  const previewBody = renderTemplate(body, SAMPLE_VARS);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[40rem] max-w-[96vw] flex-col p-0">
        {template ? (
          <>
            <header className="flex items-center justify-between border-b border-border p-5">
              <div>
                <SheetTitle className="text-base font-semibold">{template.label}</SheetTitle>
                <p className="text-xs text-muted-foreground">Email template · {template.description}</p>
              </div>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close">
                  <X />
                </Button>
              </SheetClose>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-border accent-primary" />
                <span>
                  <span className="block text-sm font-medium">Active</span>
                  <span className="block text-xs text-muted-foreground">When off, this message is not sent for the event.</span>
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Subject</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={CONTROL} />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Message body</span>
                <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={9} className={`${CONTROL} font-mono text-[13px] leading-relaxed`} />
              </label>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Insert a variable</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertToken(v.token)}
                      title={v.description}
                      className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      {`{{${v.token}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Eye className="size-3.5" /> Preview
                </p>
                <p className="text-sm font-semibold">{previewSubject || <span className="text-muted-foreground">No subject</span>}</p>
                <div className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{previewBody}</div>
              </div>

              {error ? (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border p-4">
              <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending}>
                <RotateCcw /> Reset to default
              </Button>
              <div className="flex items-center gap-2">
                <SheetClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </SheetClose>
                <Button type="button" onClick={save} disabled={pending} aria-busy={pending}>
                  {pending ? 'Saving…' : 'Save template'}
                </Button>
              </div>
            </footer>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
