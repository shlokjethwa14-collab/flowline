'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Feeds pointer coordinates to a `.spec` element as CSS variables, so the
 * specular highlight follows the cursor across that one surface.
 *
 * Writes straight to style rather than through React state: this fires on
 * every pointer move, and a re-render per frame would cost far more than the
 * effect is worth. Coarse pointers are ignored — there is no hover to track,
 * and the CSS hides the layer there anyway.
 */
export function useSpecular<T extends HTMLElement = HTMLDivElement>() {
  const specRef = useRef<T | null>(null)

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (event.pointerType !== 'mouse') return
    const el = specRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--px', `${event.clientX - rect.left}px`)
    el.style.setProperty('--py', `${event.clientY - rect.top}px`)
  }, [])

  const onPointerLeave = useCallback(() => {
    const el = specRef.current
    if (!el) return
    el.style.removeProperty('--px')
    el.style.removeProperty('--py')
  }, [])

  return { specRef, onPointerMove, onPointerLeave }
}

/**
 * A clock that ticks on an interval.
 *
 * Reading `Date.now()` straight from render makes the component impure — two
 * renders with identical props produce different output, which React's rules
 * forbid and the compiler flags. Holding the time in state makes each render
 * deterministic and puts the re-render on an explicit schedule.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
