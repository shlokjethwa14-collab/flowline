'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * One act of the story: a tall scroll region with a pinned centre.
 *
 * The outer element is `vh`-tall and provides the scroll distance; the inner
 * one is `sticky` and stays put while that distance is consumed. Copy fades
 * up on the way in and away on the way out, so at any moment exactly one act
 * is legible and the reader is never asked to choose.
 *
 * `sticky` rather than a fixed element with manual offsets: the browser does
 * the pinning, which means it survives resize, zoom, and the address bar
 * collapsing on mobile — all things a hand-rolled pin gets wrong.
 */
export function StoryAct({
  children,
  className,
  /** Scroll distance in viewport heights. Longer holds the act on screen. */
  length = 2,
  /**
   * Set on the opening act. Every other act begins off-screen and fades up as
   * it is scrolled into, but the first one is already in view when the page
   * loads — starting it at zero opacity means the visitor lands on a blank
   * screen and has to scroll before anything appears.
   */
  opening = false,
}: {
  children: React.ReactNode
  className?: string
  length?: number
  opening?: boolean
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  /*
   * Fade windows are deliberately narrow. Acts run back to back, so one act's
   * fade-out and the next one's fade-in are consecutive, never concurrent —
   * with a fifth of the act at each end, that left roughly 900px of scroll
   * where neither act was legible and the reader was looking at an empty
   * screen. Eight percent a side keeps the handover under half a viewport.
   */
  const fade = [0, 0.08, 0.92, 1]
  const opacity = useTransform(scrollYProgress, fade, [opening ? 1 : 0, 1, 1, 0])
  const y = useTransform(scrollYProgress, fade, [opening ? 0 : 40, 0, 0, -40])
  const scale = useTransform(scrollYProgress, fade, [opening ? 1 : 0.97, 1, 1, 0.99])

  return (
    <section
      ref={ref}
      className={cn(
        'relative',
        /*
         * Every act after the opening is pulled up by one viewport so it
         * overlaps its predecessor.
         *
         * A sticky child unpins one viewport before its section's bottom
         * reaches the viewport bottom, but the next section does not reach
         * the top until a further viewport of scroll — leaving ~900px where
         * one act has left and the next has not arrived, and the reader is
         * looking at an empty screen. Overlapping by exactly that amount
         * turns the handover into a crossfade instead of a hole.
         */
        !opening && '-mt-[100dvh]',
        className,
      )}
      style={{ height: `${length * 100}vh` }}
    >
      <div className="sticky top-0 flex h-dvh items-center justify-center overflow-hidden px-5">
        <motion.div
          className="relative w-full max-w-3xl text-center"
          style={reduced ? undefined : { opacity, y, scale }}
        >
          {children}
        </motion.div>
      </div>
    </section>
  )
}

/** The large line an act is built around. */
export function ActHeadline({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'text-balance text-[clamp(2rem,6vw,4.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink',
        className,
      )}
    >
      {children}
    </h2>
  )
}

/** Supporting copy under an act headline. */
export function ActBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('mx-auto mt-6 max-w-xl text-pretty text-[clamp(1rem,1.6vw,1.2rem)] leading-relaxed text-ink-muted', className)}>
      {children}
    </p>
  )
}

/** Small label above a headline. */
export function ActLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.22em] text-ink-faint">{children}</p>
  )
}
