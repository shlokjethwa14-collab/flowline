'use client'

import dynamic from 'next/dynamic'
import * as React from 'react'
import { GlassStack } from '@/components/shared/glass-stack'
import { cn } from '@/lib/utils'

/**
 * WebGL is loaded only when the device can actually run it well, and never
 * on the server. Everything else gets the CSS stack, which is a real design
 * in its own right rather than a placeholder — nobody should be able to tell
 * they are on the fallback.
 */
const Scene = dynamic(() => import('./glass-hero-scene'), {
  ssr: false,
  loading: () => null,
})

/**
 * Decides once, on mount, whether this device gets the 3D scene.
 *
 * Three gates, all cheap:
 *   - a real WebGL2 context (not just the constructor existing)
 *   - a pointer, since the scene leans toward the cursor
 *   - enough cores that a transmission shader will not starve the UI thread
 *
 * Deliberately conservative. A dropped-frame hero on a supervisor's phone is
 * worse than a static one.
 */
function useCanRenderWebGL(): boolean | null {
  const [ok, setOk] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let cancelled = false

    function decide(): boolean {
      if (typeof window === 'undefined') return false
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
      if (window.matchMedia('(pointer: coarse)').matches) return false
      if ((navigator.hardwareConcurrency ?? 2) < 4) return false
      if (window.innerWidth < 1024) return false

      try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2')
        if (!gl) return false
        // Release it immediately; the real canvas makes its own.
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        return true
      } catch {
        return false
      }
    }

    // Defer past first paint so the login form is interactive immediately.
    const id = window.setTimeout(() => {
      if (!cancelled) setOk(decide())
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [])

  return ok
}

export function GlassHero({ className }: { className?: string }) {
  const canRender = useCanRenderWebGL()

  return (
    <div className={cn('pointer-events-none relative select-none', className)} aria-hidden="true">
      {canRender ? <Scene /> : <GlassStack className="h-full w-full" />}
    </div>
  )
}
