'use client';

import { useEffect } from 'react';
import { Button } from '@booking/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side error surface; server logging happens via the logger util.
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        An unexpected error occurred while rendering this page.
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs">ref: {error.digest}</span>
        ) : null}
      </p>
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
