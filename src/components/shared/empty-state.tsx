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
        'flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-12 text-center',
        'inset-well border border-white/70',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-2xl',
          'shadow-[0_2px_6px_rgba(24,24,27,.07),inset_0_1px_0_rgba(255,255,255,.95)]',
          tone === 'success'
            ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600'
            : 'bg-gradient-to-br from-white to-zinc-100 text-zinc-400',
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-[14.5px] font-semibold text-zinc-800">{title}</p>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-zinc-500 text-pretty">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
