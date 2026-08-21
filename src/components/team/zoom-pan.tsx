'use client'

import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const MIN = 0.4
const MAX = 2.5
const STEP = 0.15

interface View {
  scale: number
  x: number
  y: number
}

const INITIAL: View = { scale: 1, x: 0, y: 0 }

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Wheel to zoom, drag to pan. Zoom is anchored on the pointer, so the node
 * under the cursor stays under the cursor — anchoring on the centre instead
 * makes the chart feel like it is sliding away from you.
 *
 * The wheel listener is attached natively rather than through React's
 * onWheel, because React attaches passively and `preventDefault` is required
 * to stop the page scrolling behind the chart.
 */
export function ZoomPan({ children, className }: { children: ReactNode; className?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(INITIAL)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  /**
   * Scales the whole chart to fit and centres it. The measurement has to
   * happen at scale 1, so it reads `scrollWidth`/`scrollHeight` of the stage
   * rather than its transformed bounding box.
   */
  const fit = useCallback(() => {
    const vp = viewportRef.current
    const stage = stageRef.current
    if (!vp || !stage) return
    const pad = 32
    const w = stage.scrollWidth
    const h = stage.scrollHeight
    if (!w || !h) return
    const scale = clamp(Math.min((vp.clientWidth - pad) / w, (vp.clientHeight - pad) / h), MIN, 1)
    setView({
      scale,
      x: (vp.clientWidth - w * scale) / 2,
      y: (vp.clientHeight - h * scale) / 2,
    })
  }, [])

  // Fit once the chart has actually rendered, and again if it changes size
  // (someone added a teammate, or the window resized).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const id = window.requestAnimationFrame(fit)
    if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(id)
    // Every callback re-fits, including the first — that one is the real
    // measurement once layout has settled, and the rAF above usually runs
    // before the cards have their final size. `fit` only writes a transform,
    // which cannot change the observed layout box, so this cannot loop.
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => {
      window.cancelAnimationFrame(id)
      observer.disconnect()
    }
  }, [fit])

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = viewportRef.current
    setView((v) => {
      const next = clamp(v.scale * factor, MIN, MAX)
      if (next === v.scale) return v
      if (!el || clientX === undefined || clientY === undefined) {
        return { ...v, scale: next }
      }
      const rect = el.getBoundingClientRect()
      // Pointer position within the viewport, in untransformed space.
      const px = clientX - rect.left
      const py = clientY - rect.top
      const ratio = next / v.scale
      return {
        scale: next,
        x: px - (px - v.x) * ratio,
        y: py - (py - v.y) * ratio,
      }
    })
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    function onWheel(event: WheelEvent) {
      // Trackpad pinch arrives as ctrlKey+wheel; a plain wheel over the chart
      // should zoom too, which is why the page scroll is suppressed here.
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      zoomAt(factor, event.clientX, event.clientY)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Leave real controls alone — only empty canvas starts a pan.
      if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y }
      setDragging(true)
    },
    [view.x, view.y],
  )

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setView((v) => ({ ...v, x: d.ox + (event.clientX - d.x), y: d.oy + (event.clientY - d.y) }))
  }, [])

  const endDrag = useCallback(() => {
    drag.current = null
    setDragging(false)
  }, [])

  const atDefault = view.scale === 1 && view.x === 0 && view.y === 0

  return (
    <div className={cn('relative', className)}>
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          'relative h-[min(70vh,640px)] touch-none overflow-hidden rounded-2xl',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <div
          ref={stageRef}
          className="inline-block origin-top-left will-change-transform"
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            // Snap while dragging or zooming; ease when fitting or resetting.
            transition: dragging ? 'none' : 'transform .32s cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {children}
        </div>
      </div>

      {/* Controls stay available for keyboards and touch. */}
      <div className="glass glass-thin absolute bottom-3 right-3 flex items-center gap-1 rounded-xl p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoomAt(1 - STEP)}
              disabled={view.scale <= MIN}
              aria-label="Zoom out"
            >
              <Minus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>

        <span className="min-w-[3.1rem] text-center text-[11.5px] font-medium tabular-nums text-zinc-500">
          {Math.round(view.scale * 100)}%
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoomAt(1 + STEP)}
              disabled={view.scale >= MAX}
              aria-label="Zoom in"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="glass" size="sm" onClick={fit} className="gap-1.5">
              <Maximize2 className="!size-3.5" />
              Fit to screen
            </Button>
          </TooltipTrigger>
          <TooltipContent>Scale the whole chart to fit</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setView(INITIAL)}
              disabled={atDefault}
              aria-label="Reset zoom to 100 percent"
            >
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset to 100%</TooltipContent>
        </Tooltip>
      </div>

      <p className="pointer-events-none absolute bottom-4 left-4 hidden text-[12px] text-zinc-500 sm:block">
        Scroll to zoom · drag to move
      </p>
    </div>
  )
}
