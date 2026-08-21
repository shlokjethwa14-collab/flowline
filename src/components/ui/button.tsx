'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Pills by default. The primary action is solid ink — near-black on light,
 * near-white on dark — rather than a tinted gradient; colour in this system
 * is light behind a control (`.neon`), not paint on it.
 *
 * Every variant still carries the three edge cues: a separating ring, a
 * specular top edge, and an inner stroke for thickness.
 */
const buttonVariants = cva(
  [
    'btn-3d relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-full text-sm font-medium select-none',
    'transition-[color,background-color,box-shadow] duration-base ease-apple-snap',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        /* Solid ink. Inverts wholesale in dark mode via the token. */
        default: [
          'bg-primary text-primary-foreground',
          'shadow-[0_1px_2px_hsl(0_0%_0%/0.16),0_6px_18px_-6px_hsl(0_0%_0%/0.34),inset_0_1px_0_rgb(255_255_255/0.16)]',
          'hover:shadow-[0_2px_4px_hsl(0_0%_0%/0.18),0_10px_26px_-6px_hsl(0_0%_0%/0.42),inset_0_1px_0_rgb(255_255_255/0.22)]',
          'active:shadow-[inset_0_3px_7px_hsl(0_0%_0%/0.34)]',
          'dark:shadow-[0_1px_2px_hsl(0_0%_0%/0.6),0_6px_18px_-6px_hsl(0_0%_0%/0.7),inset_0_-1px_0_hsl(0_0%_0%/0.12)]',
        ].join(' '),

        /* Clear glass pill. All three cues, no tint. */
        glass: [
          'text-zinc-800 backdrop-blur-xl backdrop-saturate-150',
          'bg-[linear-gradient(176deg,var(--g-fill-top),var(--g-fill-bot))]',
          'shadow-raised hover:brightness-[1.03]',
          'active:shadow-pressed',
        ].join(' '),

        secondary: [
          'bg-secondary text-secondary-foreground',
          'shadow-raised hover:brightness-[1.04]',
          'active:shadow-pressed',
        ].join(' '),

        /* Neon variants — the halo comes from `.neon`, set per instance. */
        warm: [
          'neon neon-warm neon-edge text-white',
          'bg-[linear-gradient(176deg,hsl(28_98%_64%),hsl(14_92%_54%))]',
        ].join(' '),
        cool: [
          'neon neon-cool neon-edge text-white',
          'bg-[linear-gradient(176deg,hsl(222_94%_66%),hsl(232_88%_54%))]',
        ].join(' '),

        destructive: [
          'neon neon-rose neon-edge text-white',
          'bg-[linear-gradient(176deg,hsl(4_86%_62%),hsl(2_76%_50%))]',
        ].join(' '),

        outline: [
          'text-zinc-700 backdrop-blur-md',
          'bg-[linear-gradient(176deg,var(--g-fill-top),var(--g-fill-bot))]',
          'shadow-glass-sm hover:shadow-raised active:shadow-pressed',
        ].join(' '),

        /* No edge at rest — ghosts are not surfaces until you touch them. */
        ghost: 'text-zinc-600 hover:bg-zinc-900/[.06] hover:text-zinc-900 active:bg-zinc-900/[.1]',

        link: 'text-zinc-900 underline-offset-4 hover:underline',
      },
      /* Touch targets are 44px on coarse pointers, which is the whole
         reason for the `max-md:` bumps — a 32px control is fine under a
         mouse and unusable under a thumb. */
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-4 text-[13px] max-md:h-11',
        lg: 'h-12 px-7 text-[15px]',
        pill: 'h-11 px-6',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9 max-md:h-11 max-md:w-11',
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
