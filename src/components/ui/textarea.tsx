'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { inputSurface } from './input'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputSurface, 'flex min-h-[88px] resize-y px-3.5 py-2.5 text-sm', className)}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
