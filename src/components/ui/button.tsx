'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Buttons follow the same edge rule as every other surface: an outer ring
 * for separation, a specular top edge, and an inner stroke for thickness.
 * Tinted variants add a bloom *behind* the control rather than flooding the
 * glass with colour.
 */
const buttonVariants = cva(
  [
    'btn-3d relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-xl text-sm font-medium select-none',
    'transition-[color,background-color,box-shadow] duration-base ease-apple-snap',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        /* Tinted glass. Light comes from the colour behind, not the fill. */
        default: [
          'text-primary-foreground',
          'bg-[linear-gradient(176deg,hsl(250_92%_70%),hsl(250_84%_58%)_54%,hsl(252_80%_52%))]',
          'shadow-[0_6px_20px_-5px_hsl(250_84%_58%/0.55),0_0_38px_-12px_hsl(250_84%_62%/0.6),0_0_0_0.5px_hsl(250_60%_44%/0.5),inset_0_1px_0_rgb(255_255_255/0.46),inset_0_0_0_1px_rgb(255_255_255/0.14),inset_0_-7px_12px_-9px_hsl(252_70%_28%/0.55)]',
          'hover:shadow-[0_9px_26px_-5px_hsl(250_84%_58%/0.68),0_0_54px_-10px_hsl(250_84%_64%/0.75),0_0_0_0.5px_hsl(250_60%_44%/0.55),inset_0_1px_0_rgb(255_255_255/0.55),inset_0_0_0_1px_rgb(255_255_255/0.18),inset_0_-7px_12px_-9px_hsl(252_70%_28%/0.5)]',
          'active:shadow-[inset_0_3px_7px_hsl(252_70%_24%/0.4),inset_0_1px_0_hsl(252_70%_24%/0.2),0_0_0_0.5px_hsl(250_60%_44%/0.5)]',
        ].join(' '),

        /* The warm "Primary Action" from the reference sheet. */
        warm: [
          'text-white',
          'bg-[linear-gradient(176deg,hsl(28_98%_66%),hsl(16_92%_58%)_56%,hsl(8_84%_52%))]',
          'shadow-[0_6px_20px_-5px_hsl(14_92%_56%/0.6),0_0_38px_-12px_hsl(24_96%_62%/0.65),0_0_0_0.5px_hsl(10_70%_44%/0.5),inset_0_1px_0_rgb(255_255_255/0.5),inset_0_0_0_1px_rgb(255_255_255/0.16),inset_0_-7px_12px_-9px_hsl(8_70%_26%/0.55)]',
          'hover:shadow-[0_9px_26px_-5px_hsl(14_92%_56%/0.72),0_0_56px_-10px_hsl(24_96%_64%/0.8),0_0_0_0.5px_hsl(10_70%_44%/0.55),inset_0_1px_0_rgb(255_255_255/0.58),inset_0_0_0_1px_rgb(255_255_255/0.2),inset_0_-7px_12px_-9px_hsl(8_70%_26%/0.5)]',
          'active:shadow-[inset_0_3px_7px_hsl(8_70%_22%/0.42),inset_0_1px_0_hsl(8_70%_22%/0.2),0_0_0_0.5px_hsl(10_70%_44%/0.5)]',
        ].join(' '),

        /* Clear glass. All three edge cues, no tint. */
        glass: [
          'text-zinc-800 backdrop-blur-xl backdrop-saturate-150',
          'bg-[linear-gradient(176deg,rgb(255_255_255/0.96),rgb(247_249_252/0.78))]',
          'shadow-raised',
          'hover:bg-[linear-gradient(176deg,rgb(255_255_255/1),rgb(252_253_255/0.9))]',
          'hover:shadow-[0_0_0_0.5px_hsl(225_20%_62%/0.3),0_2px_3px_hsl(225_30%_20%/0.06),0_8px_18px_-5px_hsl(225_30%_20%/0.14),inset_0_1px_0_rgb(255_255_255/1),inset_0_-1px_0_hsl(225_20%_70%/0.24)]',
          'active:shadow-pressed',
        ].join(' '),

        secondary: [
          'text-secondary-foreground',
          'bg-[linear-gradient(176deg,hsl(225_16%_97%),hsl(225_14%_91%))]',
          'shadow-raised hover:bg-[linear-gradient(176deg,hsl(225_16%_99%),hsl(225_14%_94%))]',
          'active:shadow-pressed',
        ].join(' '),

        destructive: [
          'text-destructive-foreground',
          'bg-[linear-gradient(176deg,hsl(4_84%_62%),hsl(4_74%_52%)_56%,hsl(2_70%_46%))]',
          'shadow-[0_6px_20px_-5px_hsl(4_74%_52%/0.55),0_0_36px_-12px_hsl(4_84%_58%/0.6),0_0_0_0.5px_hsl(2_60%_40%/0.5),inset_0_1px_0_rgb(255_255_255/0.42),inset_0_0_0_1px_rgb(255_255_255/0.14),inset_0_-7px_12px_-9px_hsl(2_70%_24%/0.55)]',
          'hover:shadow-[0_9px_26px_-5px_hsl(4_74%_52%/0.7),0_0_52px_-10px_hsl(4_84%_60%/0.75),0_0_0_0.5px_hsl(2_60%_40%/0.55),inset_0_1px_0_rgb(255_255_255/0.5),inset_0_0_0_1px_rgb(255_255_255/0.18),inset_0_-7px_12px_-9px_hsl(2_70%_24%/0.5)]',
          'active:shadow-[inset_0_3px_7px_hsl(2_70%_20%/0.42),inset_0_1px_0_hsl(2_70%_20%/0.2)]',
        ].join(' '),

        outline: [
          'text-zinc-700 backdrop-blur-md',
          'bg-[linear-gradient(176deg,rgb(255_255_255/0.8),rgb(248_250_253/0.6))]',
          'shadow-glass-sm hover:bg-white',
          'hover:shadow-raised active:shadow-pressed',
        ].join(' '),

        /* No edge at rest — ghosts are not surfaces until you touch them. */
        ghost: 'text-zinc-600 hover:bg-zinc-900/[.05] hover:text-zinc-900 active:bg-zinc-900/[.08]',

        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-[13px]',
        lg: 'h-12 rounded-2xl px-6 text-[15px]',
        pill: 'h-11 rounded-full px-6',
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
