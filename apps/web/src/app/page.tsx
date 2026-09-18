'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarHeart, Sparkles } from 'lucide-react';
import { buttonVariants } from '@booking/ui/button';
import { demoConfig } from '@/config/demo';

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-20">
      <div className="aurora-field" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary backdrop-blur">
          <Sparkles className="size-3.5" aria-hidden />
          Premium booking platform
        </span>

        <div className="mt-8 flex items-center justify-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-none bg-gradient-to-br from-primary to-[hsl(var(--aurora-2))] text-primary-foreground shadow-glow">
            <CalendarHeart className="size-6" aria-hidden />
          </span>
        </div>

        <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
          <span className="text-gradient">INFIN</span> Booking
        </h1>

        <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
          {demoConfig.tagline}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/book/demo-business"
            className={`${buttonVariants({ variant: 'primary', size: 'lg' })} group gap-2 shadow-glow`}
          >
            Try the booking flow
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link
            href="/admin"
            className={`${buttonVariants({ variant: 'outline', size: 'lg' })} glass`}
          >
            Open dashboard
          </Link>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="absolute bottom-8 text-xs text-muted-foreground/70"
      >
        {demoConfig.productName}
      </motion.p>
    </main>
  );
}
