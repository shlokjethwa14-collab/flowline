import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none',
    'ring-1 ring-inset whitespace-nowrap',
    // A hairline of white along the top edge, so even a chip reads as glass.
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.7)]',
    'transition-colors duration-base ease-apple-snap',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-zinc-100/90 text-zinc-700 ring-zinc-300/60',
        primary: 'bg-primary/[.1] text-primary ring-primary/25',
        success: 'bg-emerald-50/90 text-emerald-700 ring-emerald-300/60',
        warning: 'bg-amber-50/90 text-amber-700 ring-amber-300/60',
        danger: 'bg-red-50/90 text-red-700 ring-red-300/60',
        outline: 'bg-white/75 text-zinc-600 ring-zinc-300/70 backdrop-blur-sm',
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
