'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button, buttonVariants } from '@booking/ui/button';
import { demoConfig } from '@/config/demo';

const foundationChecklist = [
  'Monorepo · pnpm workspaces + Turborepo',
  'Next.js · App Router · TypeScript',
  'Tailwind + shared design-system tokens',
  'Environment validation + structured logging',
  'Error, loading & not-found boundaries',
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          Phase {demoConfig.phase} · Foundation ready
        </span>

        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {demoConfig.productName}
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-lg text-muted-foreground">
          {demoConfig.tagline} The application shell, tooling and design-system foundation
          are in place — domain features arrive in the phases ahead.
        </p>

        <ul className="mt-8 space-y-2.5">
          {foundationChecklist.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm">
              <svg
                viewBox="0 0 20 20"
                className="size-4 shrink-0 text-primary"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/admin" className={buttonVariants({ variant: 'primary' })}>
            Open dashboard
          </Link>
          <Link href="/book/demo-business" className={buttonVariants({ variant: 'outline' })}>
            Try the booking flow
          </Link>
          <Button variant="ghost" onClick={() => window.open('/api/health', '_blank')}>
            System health
          </Button>
        </div>
      </motion.div>
    </main>
  );
}
