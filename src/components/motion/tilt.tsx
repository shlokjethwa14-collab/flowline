'use client'

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import * as React from 'react'
import { TILT_DEGREES, trail } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * Deliberately narrow. Extending `HTMLAttributes` collides with Motion's own
 * drag/animation handler signatures, and this wrapper has no business
 * forwarding arbitrary DOM props anyway — the card inside owns its semantics.
 */
interface TiltProps {
  children: React.ReactNode
  /** Max rotation at the edges. Lower for dense grids. */
  degrees?: number
  /** Pixels the surface rises toward the viewer on hover. */
  liftPx?: number
  className?: string
}

/**
 * A surface that rotates in 3D toward the pointer.
 *
 * Everything runs on motion values, not React state — pointer moves fire at
 * screen rate, and re-rendering a card grid on every one of them would drop
 * frames. The values feed `transform` directly, which the compositor can
 * animate without touching layout or paint.
 *
 * The parent supplies the perspective, not this element, so sibling cards
 * share one vanishing point. Perspective set per-card gives every card its
 * own camera, which reads as warped rather than deep.
 */
export function Tilt({ children, degrees = TILT_DEGREES, liftPx = 10, className }: TiltProps) {
  const reduced = useReducedMotion()

  // -0.5 … 0.5 across the element.
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const hovered = useMotionValue(0)

  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [degrees, -degrees]), trail)
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-degrees, degrees]), trail)
  const z = useSpring(useTransform(hovered, [0, 1], [0, liftPx]), trail)

  const ref = React.useRef<HTMLDivElement | null>(null)

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Touch has no hover, and tilting under a finger fights the scroll.
      if (event.pointerType !== 'mouse' || reduced) return
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      px.set((event.clientX - r.left) / r.width - 0.5)
      py.set((event.clientY - r.top) / r.height - 0.5)
      hovered.set(1)
    },
    [px, py, hovered, reduced],
  )

  const onPointerLeave = React.useCallback(() => {
    px.set(0)
    py.set(0)
    hovered.set(0)
  }, [px, py, hovered])

  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ rotateX, rotateY, z, transformStyle: 'preserve-3d' }}
      className={cn('will-change-transform', className)}
    >
      {children}
    </motion.div>
  )
}

/**
 * Shared vanishing point for a group of tilting surfaces.
 *
 * `perspective` on the container means cards at the edge of the grid lean
 * away from the same camera the centre ones do, which is what makes a grid
 * read as one plane in space rather than a row of separate boxes.
 */
export function TiltScene({
  children,
  className,
  perspective = 1400,
}: {
  children: React.ReactNode
  className?: string
  perspective?: number
}) {
  return (
    <div className={className} style={{ perspective: `${perspective}px`, perspectiveOrigin: '50% 40%' }}>
      {children}
    </div>
  )
}
