import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ring-1 ring-inset transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-zinc-100 text-zinc-700 ring-zinc-200/70',
        primary: 'bg-primary/10 text-primary ring-primary/20',
        success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
        warning: 'bg-amber-50 text-amber-700 ring-amber-200/70',
        danger: 'bg-red-50 text-red-700 ring-red-200/70',
        outline: 'bg-white/70 text-zinc-600 ring-zinc-200',
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
