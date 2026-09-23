import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { demoConfig } from '@/config/demo';
import { Logo } from '@/components/shell/logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const highlights = [
  { icon: Zap, title: 'Lightning-fast', text: 'Clients book in seconds, from any device.' },
  { icon: ShieldCheck, title: 'Secure by design', text: 'Role-based access and hardened sessions.' },
  { icon: Sparkles, title: 'Fully brandable', text: 'Make every booking page unmistakably yours.' },
];

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="aurora-field aurora-field-soft" aria-hidden />

      {/* Brand / marketing panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-[hsl(var(--aurora-2))] to-[hsl(var(--aurora-3))] opacity-95" />
        <div className="relative flex items-center">
          <Logo className="h-10 w-auto" tone="onDark" priority />
        </div>

        <div className="relative max-w-md text-primary-foreground">
          <h2 className="text-balance text-4xl font-extrabold leading-tight">
            Bookings your brand deserves.
          </h2>
          <p className="mt-4 text-pretty text-base text-white/80">
            Manage appointments, staff and revenue from one beautifully simple workspace.
          </p>

          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-none bg-white/15 backdrop-blur">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-white/75">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">
          © {new Date().getFullYear()} {demoConfig.productName}
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-16 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center lg:hidden">
            <Logo className="h-8 w-auto" priority />
          </div>

          <div className="rounded-none border border-border/70 bg-card/80 p-8 shadow-premium backdrop-blur-xl sm:p-10">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your workspace to continue.
            </p>

            <div className="mt-8">
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
