'use client'

import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number
  /** Switches the fill to green once everything is finished. */
  complete?: boolean
}

/**
 * A lit bar sitting in a recessed track. The fill carries its own glow so it
 * reads as backlit glass rather than a painted rectangle.
 */
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
            'h-full w-full flex-1 rounded-full',
            'transition-transform duration-glass ease-apple',
            complete
              ? 'bg-[linear-gradient(90deg,hsl(160_74%_56%),hsl(152_70%_45%))] shadow-[0_0_12px_hsl(155_72%_50%/0.55),inset_0_1px_0_rgb(255_255_255/0.45)]'
              : 'bg-[linear-gradient(90deg,hsl(199_92%_68%),hsl(250_84%_64%))] shadow-[0_0_12px_hsl(225_88%_62%/0.5),inset_0_1px_0_rgb(255_255_255/0.45)]',
          )}
          style={{ transform: `translateX(-${100 - clamped}%)` }}
        />
      </ProgressPrimitive.Root>
    )
  },
)
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
