import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
  /** Renders a progress bar under the number. */
  percent?: number
  className?: string
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'from-white to-zinc-100 text-zinc-500',
  primary: 'from-violet-50 to-violet-100 text-violet-600',
  success: 'from-emerald-50 to-emerald-100 text-emerald-600',
  warning: 'from-amber-50 to-amber-100 text-amber-600',
  danger: 'from-red-50 to-red-100 text-red-600',
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', percent, className }: StatCardProps) {
  return (
    <Card className={cn('glass-card-hover p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
          <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-zinc-900">{value}</p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br',
            'shadow-[0_2px_5px_rgba(24,24,27,.06),inset_0_1px_0_rgba(255,255,255,.95)]',
            TONES[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </div>
      </div>
      {typeof percent === 'number' && (
        <Progress value={percent} complete={percent >= 100} className="mt-4 h-1.5" aria-label={`${label}: ${percent}%`} />
      )}
      {hint && <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-500">{hint}</p>}
    </Card>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-14" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-3 w-32" />
    </Card>
  )
}
