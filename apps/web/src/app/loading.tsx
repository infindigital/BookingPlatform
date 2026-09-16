export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <div className="animate-fade-in space-y-4" aria-busy="true" aria-label="Loading">
        <div className="h-6 w-40 rounded-full bg-muted" />
        <div className="h-12 w-3/4 rounded-lg bg-muted" />
        <div className="h-5 w-full rounded bg-muted" />
        <div className="h-5 w-5/6 rounded bg-muted" />
      </div>
    </main>
  );
}
