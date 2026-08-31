'use client'

import Lenis from 'lenis'
import { useReducedMotion } from 'motion/react'
import * as React from 'react'

/**
 * Momentum scrolling for the landing story.
 *
 * Lenis intercepts the wheel and drives `scrollTo` itself, so scroll position
 * eases instead of stepping. That easing is most of why a scroll-driven site
 * feels expensive: pinned elements glide between states rather than snapping
 * between wheel notches.
 *
 * Deliberately scoped to the story page and never the app. Hijacking the
 * wheel in a task list is hostile — people there are scanning for a row, not
 * being taken on a ride. It also disables itself entirely under
 * `prefers-reduced-motion`, where smoothing is exactly the wrong answer.
 */
export function SmoothScroll() {
  const reduced = useReducedMotion()

  React.useEffect(() => {
    if (reduced) return

    const lenis = new Lenis({
      // Slightly longer than default: the story's pinned sections need room
      // to interpolate, and a short duration makes them look like they jump.
      duration: 1.1,
      // Touch devices already have native momentum. Doubling up on it feels
      // like the page is sliding out from under your finger.
      syncTouch: false,
    })

    let frame = 0
    function raf(time: number) {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [reduced])

  return null
}
