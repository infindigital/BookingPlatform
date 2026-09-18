'use client';

/**
 * Top-level error boundary - catches errors in the root layout itself.
 * Must render its own <html>/<body> because it replaces the whole tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Application error</h1>
        <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          A critical error occurred.
          {error.digest ? ` (ref: ${error.digest})` : ''}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: '1.5rem',
            height: '2.25rem',
            padding: '0 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#4f46e5',
            color: '#fff',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
