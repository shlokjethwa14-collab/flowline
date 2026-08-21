import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Every variant is token-driven. The previous `outline` used a literal
 * `bg-white/75`, which stayed white in dark mode while the text inverted —
 * an unreadable white-on-white pill. Nothing here hard-codes a colour that
 * only works in one theme.
 */
const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium leading-none',
    'ring-1 ring-inset whitespace-nowrap',
    'transition-colors duration-200 ease-apple-snap',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-zinc-900/[.06] text-zinc-700 ring-zinc-900/[.08]',
        primary: 'bg-[color:var(--accent)]/10 text-zinc-900 ring-zinc-900/15',
        outline: 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.1]',
        /* Status tints carry their own foreground so contrast holds in both
           themes; --success/--warning/--danger are tuned per theme. */
        success: 'bg-[color:var(--success)]/12 text-[color:var(--success)] ring-[color:var(--success)]/25',
        warning: 'bg-[color:var(--warning)]/12 text-[color:var(--warning)] ring-[color:var(--warning)]/25',
        danger: 'bg-[color:var(--danger)]/12 text-[color:var(--danger)] ring-[color:var(--danger)]/28',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
