'use client'

import { motion, useReducedMotion } from 'motion/react'
import * as React from 'react'
import { listContainer, listItem, still, stillVariants } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * A grid whose children arrive one after another, and which supplies the
 * shared vanishing point the cards inside tilt against.
 *
 * The perspective lives here rather than on the page root: a perspective set
 * on a tall scrolling ancestor puts the camera thousands of pixels from the
 * cards at the bottom, so those barely move while the ones near the origin
 * swing hard. Per-grid perspective keeps the camera at a sane distance from
 * every card in that grid.
 *
 * `animate` runs once on mount rather than on scroll, because these grids are
 * usually above the fold and re-animating a task list as the user scrolls
 * back up reads as a glitch, not a flourish.
 */
export function StaggerGrid({
  children,
  className,
  perspective = 1200,
}: {
  children: React.ReactNode
  className?: string
  perspective?: number
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={cn(className)}
      style={{ perspective: `${perspective}px`, perspectiveOrigin: '50% 40%' }}
      variants={reduced ? undefined : listContainer}
      initial={reduced ? undefined : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      {children}
    </motion.div>
  )
}

/** One cell of a {@link StaggerGrid}. */
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()

  return (
    <motion.div className={className} variants={reduced ? stillVariants : listItem} transition={reduced ? still : undefined}>
      {children}
    </motion.div>
  )
}
