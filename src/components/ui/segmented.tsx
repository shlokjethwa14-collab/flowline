'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Announced to screen readers as the purpose of the group. */
  label: string
  className?: string
  size?: 'sm' | 'md'
}

/**
 * A segmented control where one pane of glass slides between the options,
 * rather than each option toggling its own background. The indicator is
 * measured from the live DOM so it stays correct when labels change length
 * or the font loads late.
 *
 * Radio semantics, not buttons: arrow keys move between options, which is
 * what a screen-reader user expects from a picker.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>())

  const move = React.useCallback(() => {
    const track = trackRef.current
    const active = itemRefs.current.get(value)
    if (!track || !active) return
    track.style.setProperty('--seg-x', `${active.offsetLeft}px`)
    track.style.setProperty('--seg-w', `${active.offsetWidth}px`)
  }, [value])

  React.useLayoutEffect(() => {
    move()
  }, [move])

  // Labels reflow on resize and when a web font swaps in; re-measure both.
  React.useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(move)
    observer.observe(track)
    return () => observer.disconnect()
  }, [move])

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const index = options.findIndex((o) => o.value === value)
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const next = options[(index + delta + options.length) % options.length]
    onChange(next.value)
    itemRefs.current.get(next.value)?.focus()
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'seg-track inset-well inline-flex items-center rounded-full p-1',
        // Taller on coarse pointers so each option clears 44px.
        size === 'sm' ? 'h-9 max-md:h-12' : 'h-11 max-md:h-[52px]',
        className,
      )}
    >
      <span className="seg-indicator" aria-hidden="true" />
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) itemRefs.current.set(option.value, node)
              else itemRefs.current.delete(option.value)
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-[1] inline-flex select-none items-center justify-center gap-1.5 rounded-full',
              'font-medium transition-colors duration-200 ease-apple-snap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              size === 'sm' ? 'h-7 px-3 text-[13px] max-md:h-10' : 'h-9 px-4 text-sm max-md:h-11',
              active ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
