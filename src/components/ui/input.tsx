'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/**
 * Inputs are recessed, not raised. The specular edge sits on the *outside*
 * bottom lip and the shading runs down from the top — the exact inverse of
 * `.glass`, which is what makes a field read as carved into the panel.
 */
export const inputSurface = [
  'w-full rounded-xl text-zinc-900',
  'bg-[linear-gradient(180deg,hsl(225_16%_95%/0.72),rgb(255_255_255/0.58))]',
  'backdrop-blur-sm',
  'shadow-[inset_0_1.5px_3px_hsl(225_30%_30%/0.09),inset_0_0_0_0.5px_hsl(225_20%_62%/0.24),0_1px_0_rgb(255_255_255/0.9)]',
  'transition-[background-color,box-shadow] duration-base ease-apple-snap',
  'placeholder:text-zinc-400',
  'hover:shadow-[inset_0_1.5px_3px_hsl(225_30%_30%/0.1),inset_0_0_0_0.5px_hsl(225_20%_62%/0.34),0_1px_0_rgb(255_255_255/0.9)]',
  'focus-visible:outline-none focus-visible:bg-white',
  'focus-visible:shadow-[inset_0_1px_2px_hsl(225_30%_30%/0.05),inset_0_0_0_1px_hsl(var(--primary)/0.55),0_0_0_4px_hsl(var(--primary)/0.12),0_0_18px_-4px_hsl(var(--primary)/0.35)]',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-[invalid=true]:shadow-[inset_0_1px_2px_hsl(225_30%_30%/0.05),inset_0_0_0_1px_hsl(var(--destructive)/0.6),0_0_0_4px_hsl(var(--destructive)/0.12)]',
].join(' ')

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      inputSurface,
      'flex h-10 px-3.5 py-2 text-sm',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
