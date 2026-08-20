'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[70] overflow-hidden rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-zinc-50',
        'bg-[hsl(225_28%_14%/0.92)] backdrop-blur-md backdrop-saturate-150',
        'shadow-[0_0_0_0.5px_hsl(225_30%_8%/0.5),0_6px_18px_-4px_hsl(225_30%_10%/0.35),inset_0_1px_0_rgb(255_255_255/0.12)]',
        'origin-[var(--radix-tooltip-content-transform-origin)]',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'ease-apple-snap [animation-duration:180ms]',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
