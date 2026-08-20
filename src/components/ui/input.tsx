'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-xl border border-zinc-200/90 bg-white/80 px-3.5 py-2 text-sm text-zinc-900 shadow-[inset_0_1px_2px_rgba(24,24,27,.05)] backdrop-blur-sm transition-all',
      'placeholder:text-zinc-400',
      'hover:border-zinc-300',
      'focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 focus-visible:bg-white',
      'disabled:cursor-not-allowed disabled:opacity-55',
      'aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-red-500/10',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
