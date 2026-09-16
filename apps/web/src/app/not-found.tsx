import Link from 'next/link';
import { buttonVariants } from '@booking/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="font-mono text-sm text-muted-foreground">404</span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you are looking for does not exist or has moved.
      </p>
      <div className="mt-6">
        <Link href="/" className={buttonVariants({ variant: 'primary' })}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
