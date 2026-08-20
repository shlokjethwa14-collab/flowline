'use client'

import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number
  /** Colours the fill green once everything is finished. */
  complete?: boolean
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value = 0, complete = false, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value))
    return (
      <ProgressPrimitive.Root
        ref={ref}
        value={clamped}
        className={cn('inset-well relative h-2 w-full overflow-hidden rounded-full', className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'h-full w-full flex-1 rounded-full transition-transform duration-700 ease-spring',
            complete
              ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,.45)]'
              : 'bg-gradient-to-r from-[hsl(250_84%_70%)] to-[hsl(250_84%_58%)] shadow-[0_0_10px_rgba(109,88,240,.35)]',
          )}
          style={{ transform: `translateX(-${100 - clamped}%)` }}
        />
      </ProgressPrimitive.Root>
    )
  },
)
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
