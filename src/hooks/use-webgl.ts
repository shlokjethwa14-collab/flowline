'use client'

import * as React from 'react'

/**
 * Decides once, on mount, whether this device should get a WebGL scene.
 *
 * Four gates, all cheap:
 *   - no reduced-motion preference
 *   - a real WebGL2 context, not just the constructor existing
 *   - enough cores that a transmission shader will not starve the UI thread
 *   - a wide enough viewport that the scene is actually worth the battery
 *
 * Deliberately conservative. A dropped-frame hero on a supervisor's phone is
 * worse than a static one, and every caller has a CSS fallback that stands on
 * its own. Returns `null` until the check has run, so nothing renders during
 * the server pass or the first paint.
 */
export function useCanRenderWebGL(): boolean | null {
  const [ok, setOk] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let cancelled = false

    function decide(): boolean {
      if (typeof window === 'undefined') return false
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
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

    // Defer past first paint so the page is interactive immediately.
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
