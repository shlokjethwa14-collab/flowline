'use client'

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

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
  const ref = useRef<T | null>(null)

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (event.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--px', `${event.clientX - rect.left}px`)
    el.style.setProperty('--py', `${event.clientY - rect.top}px`)
  }, [])

  const onPointerLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.removeProperty('--px')
    el.style.removeProperty('--py')
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
