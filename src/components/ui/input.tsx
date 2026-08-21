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
  'w-full rounded-2xl text-zinc-900',
  'bg-[linear-gradient(180deg,var(--g-well-a),var(--g-well-b))]',
  'backdrop-blur-sm',
  'shadow-[inset_0_1.5px_3px_var(--g-well-sh),inset_0_0_0_0.5px_var(--g-ring),0_1px_0_var(--g-rim-5)]',
  'transition-[background-color,box-shadow] duration-base ease-apple-snap',
  'placeholder:text-zinc-400',
  'hover:shadow-[inset_0_1.5px_3px_var(--g-well-sh),inset_0_0_0_0.5px_var(--g-ring-strong),0_1px_0_var(--g-rim-5)]',
  'focus-visible:outline-none',
  'focus-visible:shadow-[inset_0_1px_2px_var(--g-well-sh),inset_0_0_0_1.5px_hsl(var(--ring)/0.85),0_0_0_4px_hsl(var(--ring)/0.1)]',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-[invalid=true]:shadow-[inset_0_1px_2px_var(--g-well-sh),inset_0_0_0_1.5px_hsl(var(--destructive)/0.7),0_0_0_4px_hsl(var(--destructive)/0.12)]',
].join(' ')

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      inputSurface,
      'flex h-11 px-4 py-2 text-sm',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
