'use client';

import { useState, useTransition } from 'react';
import { DatabaseZap, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@booking/ui/button';
import { updateDatabaseSchemaAction, type DbUpdateResult } from '@/server/settings/actions';

/**
 * Non-destructive "Update database" control. Applies any pending schema changes
 * (e.g. after a deploy that added fields) while preserving all existing data.
 * Replaces the need to hit the destructive reprovision URL by hand.
 */
export function MaintenancePanel() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DbUpdateResult | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      const res = await updateDatabaseSchemaAction();
      setResult(res);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-md ring-1 ring-white/20">
          <DatabaseZap className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Update database</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Applies the latest structure changes to your database after an update - for example if
            saving a service price or opening the form designer starts failing. This is safe: it{' '}
            <strong>never deletes your data</strong>, it only adds anything missing. Run it once after
            a new release.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending} aria-busy={pending} className="gap-2">
          {pending ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <DatabaseZap className="size-4" aria-hidden />}
          {pending ? 'Updating…' : 'Update database'}
        </Button>
        {result?.ok ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden />
            {result.seeded
              ? 'Database set up and Midwest data loaded.'
              : 'Up to date - your data was preserved.'}
          </span>
        ) : null}
      </div>

      {result?.ok ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {result.applied ?? 0} statements applied · {result.skipped ?? 0} already in place. You can
          now edit service prices and open the form designer.
        </p>
      ) : null}

      {result && !result.ok ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{result.error ?? 'Could not update the database.'}</span>
        </p>
      ) : null}
    </section>
  );
}
