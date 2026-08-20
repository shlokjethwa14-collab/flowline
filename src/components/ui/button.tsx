'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'btn-3d inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-b from-[hsl(250_84%_66%)] to-[hsl(250_84%_57%)] text-primary-foreground shadow-[0_1px_1px_rgba(24,24,27,.06),0_3px_10px_-2px_rgba(109,88,240,.45),inset_0_1px_0_rgba(255,255,255,.32)] hover:to-[hsl(250_84%_54%)] active:shadow-[inset_0_2px_6px_rgba(24,24,27,.25)]',
        glass:
          'bg-gradient-to-b from-white/95 to-zinc-50/80 text-zinc-800 border border-white/90 backdrop-blur-xl shadow-raised hover:from-white hover:to-white active:shadow-pressed',
        secondary:
          'bg-gradient-to-b from-zinc-100 to-zinc-200/80 text-secondary-foreground border border-white/70 shadow-raised hover:from-zinc-50 hover:to-zinc-100 active:shadow-pressed',
        destructive:
          'bg-gradient-to-b from-red-500 to-red-600 text-destructive-foreground shadow-[0_1px_1px_rgba(24,24,27,.06),0_3px_10px_-2px_rgba(220,38,38,.4),inset_0_1px_0_rgba(255,255,255,.28)] hover:to-red-700 active:shadow-[inset_0_2px_6px_rgba(24,24,27,.25)]',
        outline:
          'border border-zinc-200 bg-white/70 backdrop-blur-md text-zinc-700 shadow-glass-sm hover:bg-white hover:border-zinc-300 active:shadow-pressed',
        ghost: 'text-zinc-600 hover:bg-zinc-900/[.05] hover:text-zinc-900 active:bg-zinc-900/[.08]',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-[13px]',
        lg: 'h-12 rounded-2xl px-6 text-[15px]',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
