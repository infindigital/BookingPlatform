'use client';

import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@booking/ui/tooltip';

/** Client-side providers mounted once at the root (theme + tooltips). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </ThemeProvider>
  );
}
