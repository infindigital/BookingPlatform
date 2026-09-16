import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Compact status/label pill. `tone` variants are semantic (not per-domain) so the
 * same primitive serves booking statuses, counts, and general labels.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        info: 'border-transparent bg-primary/10 text-primary',
        success:
          'border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        warning:
          'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400',
        danger: 'border-transparent bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
