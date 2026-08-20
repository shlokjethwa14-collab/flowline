'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import * as React from 'react'
import { cn } from '@/lib/utils'

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square h-[18px] w-[18px] rounded-full border border-zinc-300 bg-white shadow-[inset_0_1px_2px_rgba(24,24,27,.06)] transition-all',
      'hover:border-primary/50',
      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
