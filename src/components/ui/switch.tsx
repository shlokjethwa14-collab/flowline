'use client'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The pill toggle from the reference sheet: a recessed track that fills with
 * ink when on, and a knob that reads as a solid object sitting in it rather
 * than a painted circle.
 *
 * `tone` swaps the on-state fill for a colour where the meaning is
 * "running" rather than merely "on".
 */
const TRACK_ON: Record<'ink' | 'green', string> = {
  ink: 'data-[state=checked]:bg-primary',
  green:
    'data-[state=checked]:bg-[linear-gradient(176deg,hsl(150_76%_52%),hsl(152_72%_40%))] data-[state=checked]:shadow-[0_0_0_1px_hsl(152_70%_34%/0.5),0_2px_10px_-2px_hsl(150_76%_46%/0.55),inset_0_1px_0_rgb(255_255_255/0.3)]',
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { tone?: 'ink' | 'green' }
>(({ className, tone = 'ink', ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full p-[3px]',
      'transition-[background-color,box-shadow] duration-base ease-apple-snap',
      // Off: a recessed well, light on the outside.
      'bg-[linear-gradient(180deg,var(--g-well-a),var(--g-well-b))]',
      'shadow-[inset_0_1.5px_3px_var(--g-well-sh),inset_0_0_0_0.5px_var(--g-ring)]',
      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20',
      'disabled:cursor-not-allowed disabled:opacity-50',
      TRACK_ON[tone],
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-white',
        'shadow-[0_1px_2px_hsl(0_0%_0%/0.28),0_2px_6px_-1px_hsl(0_0%_0%/0.24),inset_0_-1px_0_hsl(0_0%_0%/0.06)]',
        'transition-transform duration-base ease-apple-pop',
        'data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5',
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
