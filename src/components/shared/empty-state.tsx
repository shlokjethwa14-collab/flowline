import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
  /** Green treatment for "everything is finished" rather than "nothing here". */
  tone?: 'neutral' | 'success'
}

export function EmptyState({ icon: Icon, title, description, action, className, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3.5 rounded-2xl px-6 py-14 text-center',
        'inset-well',
        className,
      )}
    >
      {/* A glass tile floating in the well — same edge rules, smaller scale. */}
      <div
        className={cn(
          'relative flex h-16 w-16 items-center justify-center rounded-2xl',
          'animate-float',
          tone === 'success'
            ? 'bg-[linear-gradient(176deg,hsl(158_70%_64%),hsl(160_66%_48%))] text-white shadow-[0_6px_18px_-4px_hsl(160_66%_48%/0.5),0_0_28px_-6px_hsl(158_70%_58%/0.6),inset_0_1.5px_0_rgb(255_255_255/0.5),inset_0_0_0_1px_rgb(255_255_255/0.18)]'
            : 'bg-[linear-gradient(176deg,rgb(255_255_255/0.98),rgb(244_246_251/0.8))] text-zinc-400 shadow-[0_0_0_0.5px_hsl(225_20%_62%/0.28),0_6px_18px_-6px_hsl(225_30%_20%/0.16),inset_0_1.5px_0_rgb(255_255_255/1),inset_0_0_0_1px_rgb(255_255_255/0.6),inset_0_-8px_14px_-12px_hsl(225_30%_40%/0.3)]',
        )}
      >
        <Icon className="h-7 w-7" strokeWidth={1.6} />
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold tracking-[-0.011em] text-zinc-800">{title}</p>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-zinc-500 text-pretty">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
