import { cn } from '@/lib/utils'

interface Pane {
  /** Horizontal offset in percent of the container width. */
  x: number
  /** Scale, so the stack reads as receding in depth. */
  scale: number
  tint: string
  opacity: number
  blur: number
  delay: string
}

/**
 * Stacked panes of tinted glass, seen slightly off-axis. Each pane carries
 * the same three edge cues as a real surface — the stack only reads as glass
 * because you can see every individual rim through the ones in front.
 *
 * Pure CSS: no canvas, no WebGL, nothing that costs a frame on a cheap laptop.
 */
const PANES: Pane[] = [
  { x: -34, scale: 0.9, tint: 'hsl(199 92% 74% / 0.16)', opacity: 0.55, blur: 0, delay: '0s' },
  { x: -22, scale: 0.95, tint: 'hsl(0 0% 100% / 0.32)', opacity: 0.7, blur: 1, delay: '0.9s' },
  { x: -10, scale: 1, tint: 'hsl(250 84% 72% / 0.2)', opacity: 0.8, blur: 0, delay: '1.8s' },
  { x: 2, scale: 1.02, tint: 'hsl(199 92% 70% / 0.26)', opacity: 0.9, blur: 2, delay: '2.7s' },
  { x: 14, scale: 1, tint: 'hsl(0 0% 100% / 0.5)', opacity: 0.95, blur: 3, delay: '3.6s' },
  { x: 26, scale: 0.95, tint: 'hsl(162 72% 68% / 0.22)', opacity: 0.7, blur: 1, delay: '4.5s' },
  { x: 38, scale: 0.9, tint: 'hsl(199 92% 74% / 0.14)', opacity: 0.5, blur: 0, delay: '5.4s' },
]

export function GlassStack({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none relative select-none [perspective:1400px]', className)}
      aria-hidden="true"
    >
      {/* The light the panes are catching. */}
      <div className="absolute left-1/2 top-1/2 h-[62%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(199_92%_72%/0.45),hsl(250_84%_72%/0.22),transparent)] blur-2xl animate-bloom" />

      {PANES.map((pane, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-[74%] w-[26%] rounded-[999px] animate-float"
          style={{
            transform: `translate(-50%, -50%) translateX(${pane.x}%) scale(${pane.scale}) rotateY(-14deg)`,
            background: pane.tint,
            opacity: pane.opacity,
            backdropFilter: pane.blur ? `blur(${pane.blur}px) saturate(150%)` : undefined,
            WebkitBackdropFilter: pane.blur ? `blur(${pane.blur}px) saturate(150%)` : undefined,
            // The three cues, per pane: outer ring, specular top, inner stroke.
            boxShadow: [
              '0 0 0 0.5px hsl(225 20% 62% / 0.28)',
              '0 10px 30px -12px hsl(225 30% 20% / 0.22)',
              'inset 0 1px 0 rgb(255 255 255 / 0.9)',
              'inset 0 0 0 1px rgb(255 255 255 / 0.32)',
            ].join(','),
            animationDelay: pane.delay,
            animationDuration: '11s',
          }}
        />
      ))}
    </div>
  )
}
