'use client'

import { usePathname } from 'next/navigation'
import { useReducedMotion } from 'motion/react'
import * as React from 'react'

/**
 * The living background the whole app sits on.
 *
 * WWDC25's "Meet Liquid Glass" makes the point that the material's adaptivity
 * only means something when there is something underneath to adapt to: tint,
 * shadow and dynamic range all shift with the background content. A flat
 * background gives the glass nothing to work with, so this supplies a slow,
 * continuously moving field for it to react against.
 *
 * "Adaptive" here is meant literally — it responds to four things:
 *
 *   - **Theme.** Light and dark get different palettes, not the same one
 *     dimmed.
 *   - **Place.** Each screen has its own hue anchor, so moving between Team
 *     Flow and the Evening Report feels like moving somewhere, and the
 *     transition is a slow drift rather than a cut.
 *   - **Time of day.** Cool around midday, warm towards evening. Flowline is
 *     an app about how a day went; the background should know roughly where
 *     in that day you are.
 *   - **Scroll.** The field drifts against the page, so glass surfaces move
 *     over a changing backdrop instead of a static one.
 *
 * Canvas 2D rather than WebGL on purpose. This runs on every screen of a tool
 * people keep open all day, including cheap phones — a handful of blurred
 * radial gradients costs almost nothing, needs no capability gate, and has no
 * context to lose. The expensive WebGL scene stays on the landing page.
 */

interface Blob {
  /** Phase offsets so no two blobs share a path. */
  px: number
  py: number
  /** How far it travels, as a fraction of the viewport. */
  ax: number
  ay: number
  /** Cycle lengths in seconds — deliberately coprime, so it never loops. */
  sx: number
  sy: number
  /** Radius as a fraction of the viewport's larger edge. */
  radius: number
  /** Where this blob's hue sits relative to the screen's anchor. */
  hueOffset: number
}

/*
 * Cycle lengths are coprime so the arrangement never repeats, and short
 * enough that the movement is actually perceptible — at a minute per cycle
 * the field was mathematically moving and visually static, which is the
 * worst of both.
 */
const BLOBS: Blob[] = [
  { px: 0.0, py: 1.1, ax: 0.30, ay: 0.20, sx: 11, sy: 17, radius: 0.62, hueOffset: 0 },
  { px: 2.1, py: 0.4, ax: 0.34, ay: 0.26, sx: 19, sy: 13, radius: 0.54, hueOffset: 34 },
  { px: 4.2, py: 3.3, ax: 0.24, ay: 0.30, sx: 23, sy: 29, radius: 0.48, hueOffset: -28 },
  { px: 1.3, py: 5.0, ax: 0.38, ay: 0.18, sx: 31, sy: 21, radius: 0.44, hueOffset: 62 },
]

/** Hue anchor per screen, in degrees. */
const ROUTE_HUE: Record<string, number> = {
  '/team-flow': 258,
  '/my-day': 268,
  '/calendar': 214,
  '/assign': 286,
  '/evening-report': 242,
  '/all-work': 190,
  '/welcome': 258,
}

function hueForPath(pathname: string): number {
  const key = Object.keys(ROUTE_HUE).find((route) => pathname.startsWith(route))
  return key ? ROUTE_HUE[key]! : 252
}

/**
 * A gentle warm/cool shift across the working day: coolest around midday,
 * warmest at either end. Returns degrees to add to the route's hue.
 */
function hueShiftForTimeOfDay(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60
  // Peak cool at 13:00, peak warm at 01:00.
  return Math.cos(((hours - 13) / 24) * Math.PI * 2) * 16
}

export function AmbientField() {
  const hostRef = React.useRef<HTMLCanvasElement | null>(null)
  const pathname = usePathname()
  const reduced = useReducedMotion()

  /*
   * The target hue is written to a ref rather than held in state. The render
   * loop eases towards it every frame, so a route change becomes a drift
   * across a couple of seconds instead of a jump — and changing routes never
   * re-runs the effect or restarts the animation.
   */
  const targetHue = React.useRef(hueForPath(pathname))

  React.useEffect(() => {
    targetHue.current = hueForPath(pathname) + hueShiftForTimeOfDay(new Date())
  }, [pathname])

  /*
   * The time-of-day component keeps moving even if nobody navigates. Once an
   * hour is far more often than the curve needs — it shifts by about four
   * degrees across a whole hour — but it costs nothing and means a screen
   * left open all afternoon still ends the day somewhere different from
   * where it started.
   */
  React.useEffect(() => {
    const id = window.setInterval(() => {
      targetHue.current = hueForPath(pathname) + hueShiftForTimeOfDay(new Date())
    }, 3_600_000)
    return () => window.clearInterval(id)
  }, [pathname])

  React.useEffect(() => {
    const canvas = hostRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    /** Rendered well below CSS size: the result is blurred beyond recognition. */
    const SCALE = 0.25

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width * SCALE))
      height = Math.max(1, Math.round(rect.height * SCALE))
      canvas!.width = width
      canvas!.height = height
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    let hue = targetHue.current
    let frame = 0
    let last = 0
    const started = performance.now()

    function isDark() {
      return document.documentElement.classList.contains('dark')
    }

    function draw(now: number) {
      frame = requestAnimationFrame(draw)

      // 30fps is plenty for something this soft, and halves the cost.
      if (now - last < 33) return
      last = now

      const ctx = context!
      const dark = isDark()
      const t = reduced ? 0 : (now - started) / 1000
      // Scroll nudges the field so glass moves over changing ground.
      const scroll = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)

      // Fast enough that arriving on a screen feels like arriving somewhere,
      // slow enough that it reads as a drift rather than a cut.
      hue += (targetHue.current - hue) * 0.05

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = dark ? '#08080e' : '#f7f8fc'
      ctx.fillRect(0, 0, width, height)

      const longEdge = Math.max(width, height)
      ctx.globalCompositeOperation = dark ? 'lighter' : 'multiply'

      for (const blob of BLOBS) {
        const x = width * (0.5 + blob.ax * Math.sin(t / blob.sx + blob.px))
        const y = height * (0.5 + blob.ay * Math.cos(t / blob.sy + blob.py) - scroll * 0.16)
        const r = longEdge * blob.radius

        const h = (hue + blob.hueOffset + 360) % 360
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
        if (dark) {
          gradient.addColorStop(0, `hsl(${h} 70% 22% / 0.95)`)
          gradient.addColorStop(1, `hsl(${h} 70% 22% / 0)`)
        } else {
          // multiply darkens, so a light tint reads as a soft wash.
          gradient.addColorStop(0, `hsl(${h} 62% 86% / 0.95)`)
          gradient.addColorStop(1, `hsl(${h} 62% 100% / 0)`)
        }
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
    }

    frame = requestAnimationFrame(draw)

    // Nothing to animate while the tab is hidden.
    function onVisibility() {
      cancelAnimationFrame(frame)
      if (!document.hidden) frame = requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced])

  return (
    <canvas
      ref={hostRef}
      aria-hidden="true"
      className="ambient-field pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  )
}
