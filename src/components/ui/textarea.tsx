'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[88px] w-full rounded-xl border border-zinc-200/90 bg-white/80 px-3.5 py-2.5 text-sm text-zinc-900 shadow-[inset_0_1px_2px_rgba(24,24,27,.05)] backdrop-blur-sm transition-all',
      'placeholder:text-zinc-400 resize-y',
      'hover:border-zinc-300',
      'focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 focus-visible:bg-white',
      'disabled:cursor-not-allowed disabled:opacity-55',
      'aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-red-500/10',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
