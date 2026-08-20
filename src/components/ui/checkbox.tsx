'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Unchecked it is a recessed well; checked it becomes a lit, raised chip.
 * The tick springs in with a slight overshoot — Apple never fades a state
 * change that the user just caused.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-[19px] w-[19px] shrink-0 rounded-[7px]',
      'transition-[background-color,box-shadow,transform] duration-base ease-apple-snap',
      'bg-[linear-gradient(180deg,hsl(225_16%_94%/0.8),rgb(255_255_255/0.7))]',
      'shadow-[inset_0_1.5px_3px_hsl(225_30%_30%/0.1),inset_0_0_0_0.5px_hsl(225_20%_62%/0.3),0_1px_0_rgb(255_255_255/0.9)]',
      'hover:shadow-[inset_0_1.5px_3px_hsl(225_30%_30%/0.1),inset_0_0_0_1px_hsl(var(--primary)/0.35),0_1px_0_rgb(255_255_255/0.9)]',
      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15',
      'active:scale-90',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-[linear-gradient(176deg,hsl(250_92%_70%),hsl(250_84%_57%))]',
      'data-[state=checked]:text-white',
      'data-[state=checked]:shadow-[0_3px_10px_-2px_hsl(250_84%_58%/0.55),0_0_20px_-6px_hsl(250_84%_64%/0.6),0_0_0_0.5px_hsl(250_60%_44%/0.45),inset_0_1px_0_rgb(255_255_255/0.45),inset_0_0_0_1px_rgb(255_255_255/0.16)]',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current animate-pop-in">
      <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
