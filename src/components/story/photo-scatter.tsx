'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import Image from 'next/image'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ScatterPhoto {
  src: string
  alt: string
  /** Percentage of the container width. */
  x: number
  /** Percentage of the container height. */
  y: number
  /** Width in pixels at the default breakpoint. */
  width: number
  /** Resting tilt, degrees. */
  rotate: number
  /**
   * How far this photo travels relative to the scroll. Higher moves faster,
   * which is what separates the near plane from the far one.
   */
  depth: number
}

/**
 * Photographs thrown across the viewport at angles, drifting at different
 * rates as the page scrolls.
 *
 * The parallax is the whole point: identical travel on every photo reads as
 * one flat sheet sliding by. Varying `depth` per photo is what makes the
 * group read as depth rather than decoration.
 *
 * Images are decorative — the copy underneath carries the meaning — so they
 * take empty alt text and sit behind the text in the stacking order.
 */
export function PhotoScatter({ photos, className }: { photos: ScatterPhoto[]; className?: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    // Track from the moment the block enters the viewport to the moment it
    // leaves, so the drift spans the whole time it is on screen.
    offset: ['start end', 'end start'],
  })

  return (
    <div ref={ref} className={cn('pointer-events-none relative', className)} aria-hidden="true">
      {photos.map((photo) => (
        <ScatterItem key={photo.src} photo={photo} progress={scrollYProgress} reduced={Boolean(reduced)} />
      ))}
    </div>
  )
}

function ScatterItem({
  photo,
  progress,
  reduced,
}: {
  photo: ScatterPhoto
  progress: ReturnType<typeof useScroll>['scrollYProgress']
  reduced: boolean
}) {
  // Travel is expressed in pixels rather than percent so a tall photo and a
  // short one at the same depth actually move together.
  const y = useTransform(progress, [0, 1], [photo.depth * 90, photo.depth * -90])
  const rotate = useTransform(progress, [0, 1], [photo.rotate - 2, photo.rotate + 2])

  return (
    <motion.div
      className={cn(
        'absolute overflow-hidden rounded-xl shadow-[0_20px_50px_-20px_rgba(0,0,0,.45)] ring-1 ring-black/5',
        // On a phone the scatter has nowhere to go but on top of the copy, so
        // it steps back and becomes texture. At the design width it is a
        // full-strength photograph.
        'opacity-50 md:opacity-100',
      )}
      style={{
        left: `${photo.x}%`,
        top: `${photo.y}%`,
        // Capped in viewport units as well as pixels: a fixed 225px is a
        // quiet accent at 1440 and three-fifths of the screen at 375.
        width: `min(${photo.width}px, 26vw)`,
        y: reduced ? 0 : y,
        rotate: reduced ? photo.rotate : rotate,
      }}
    >
      <Image
        src={photo.src}
        alt=""
        width={720}
        height={960}
        className="h-auto w-full select-none"
        sizes="(max-width: 768px) 40vw, 360px"
      />
    </motion.div>
  )
}
