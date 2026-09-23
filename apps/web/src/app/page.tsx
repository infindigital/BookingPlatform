'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { buttonVariants } from '@booking/ui/button';
import { demoConfig } from '@/config/demo';

export default function HomePage() {
  return (
    <main
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-20 text-white"
      style={{ backgroundColor: '#0F4368' }}
    >
      <div className="aurora-field opacity-40" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur">
          <Sparkles className="size-3.5" aria-hidden />
          Premium booking platform
        </span>

        <h1 className="mt-8 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
          Midwest Identity Services
        </h1>

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
        className="absolute bottom-8 text-xs text-white/60"
      >
        {demoConfig.productName}
      </motion.p>
    </main>
  );
}
