'use client'

import dynamic from 'next/dynamic'
import { useScroll } from 'motion/react'
import * as React from 'react'
import { useCanRenderWebGL } from '@/hooks/use-webgl'

const Scene = dynamic(() => import('@/components/three/story-field-scene'), {
  ssr: false,
  loading: () => null,
})

/**
 * The fixed layer the whole story scrolls past.
 *
 * Scroll progress is pushed into a ref rather than React state on purpose:
 * scroll fires at screen rate, and re-rendering a tree that owns a WebGL
 * canvas on every one of those events would drop frames the scene is
 * otherwise perfectly capable of hitting.
 *
 * The CSS fallback is a real gradient field, not an apology — most phones
 * land on it, and it has to look deliberate.
 */
export function StoryField() {
  const canRender = useCanRenderWebGL()
  const progressRef = React.useRef(0)
  const { scrollYProgress } = useScroll()

  React.useEffect(() => scrollYProgress.on('change', (v) => {
    progressRef.current = v
  }), [scrollYProgress])

  return (
    // z-0, never a negative index: the body's background is painted by the
    // root element, which sits beneath every negative layer. At -z-10 this
    // rendered perfectly and was completely hidden behind an opaque white
    // page. The story content is lifted to z-10 to sit above it instead.
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      {canRender ? (
        <Scene progressRef={progressRef} />
      ) : (
        <div className="story-field-fallback h-full w-full" />
      )}
    </div>
  )
}
