'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-[18px] w-[18px] shrink-0 rounded-[6px] border border-zinc-300 bg-white shadow-[inset_0_1px_2px_rgba(24,24,27,.06)] transition-all duration-200',
      'hover:border-primary/50',
      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary data-[state=checked]:bg-gradient-to-b data-[state=checked]:from-[hsl(250_84%_66%)] data-[state=checked]:to-[hsl(250_84%_58%)] data-[state=checked]:text-white data-[state=checked]:shadow-[0_1px_3px_rgba(109,88,240,.4),inset_0_1px_0_rgba(255,255,255,.3)]',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
