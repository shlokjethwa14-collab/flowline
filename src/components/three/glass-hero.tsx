'use client'

import dynamic from 'next/dynamic'
import { GlassStack } from '@/components/shared/glass-stack'
import { useCanRenderWebGL } from '@/hooks/use-webgl'
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

export function GlassHero({ className }: { className?: string }) {
  const canRender = useCanRenderWebGL()

  return (
    <div className={cn('pointer-events-none relative select-none', className)} aria-hidden="true">
      {canRender ? <Scene /> : <GlassStack className="h-full w-full" />}
    </div>
  )
}
