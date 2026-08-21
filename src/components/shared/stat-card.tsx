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

/** Raised, lit tiles. The glow is the tone; the glass stays near-white. */
const TILES: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral:
    'bg-[linear-gradient(176deg,hsl(225_18%_74%),hsl(225_16%_56%))] text-white shadow-[0_4px_12px_-3px_hsl(225_16%_54%/0.45),0_0_20px_-6px_hsl(225_20%_62%/0.5),inset_0_1px_0_rgb(255_255_255/0.42)]',
  primary:
    'bg-[linear-gradient(176deg,hsl(250_92%_74%),hsl(250_84%_58%))] text-white shadow-[0_4px_12px_-3px_hsl(250_84%_58%/0.5),0_0_22px_-6px_hsl(250_88%_66%/0.62),inset_0_1px_0_rgb(255_255_255/0.45)]',
  success:
    'bg-[linear-gradient(176deg,hsl(158_70%_62%),hsl(160_66%_46%))] text-white shadow-[0_4px_12px_-3px_hsl(160_66%_46%/0.5),0_0_22px_-6px_hsl(158_70%_58%/0.62),inset_0_1px_0_rgb(255_255_255/0.45)]',
  warning:
    'bg-[linear-gradient(176deg,hsl(40_96%_66%),hsl(28_92%_54%))] text-white shadow-[0_4px_12px_-3px_hsl(28_92%_54%/0.5),0_0_22px_-6px_hsl(38_94%_62%/0.62),inset_0_1px_0_rgb(255_255_255/0.45)]',
  danger:
    'bg-[linear-gradient(176deg,hsl(4_92%_70%),hsl(4_78%_54%))] text-white shadow-[0_4px_12px_-3px_hsl(4_78%_54%/0.5),0_0_22px_-6px_hsl(4_88%_62%/0.62),inset_0_1px_0_rgb(255_255_255/0.45)]',
}

const BLOOMS: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: '[--bloom:hsl(225_20%_62%/0.3)]',
  primary: '[--bloom:hsl(250_88%_68%/0.4)]',
  success: '[--bloom:hsl(158_72%_58%/0.4)]',
  warning: '[--bloom:hsl(38_94%_62%/0.4)]',
  danger: '[--bloom:hsl(4_88%_64%/0.4)]',
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', percent, className }: StatCardProps) {
  return (
    <Card className={cn('bloom-host group glass-card-hover p-5', BLOOMS[tone], className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-zinc-400">{label}</p>
          {/* Headline figures carry the page, the way the balance does in
              the reference. Tight tracking, tabular so they never jitter. */}
          <p className="text-[38px] font-semibold leading-[0.95] tracking-[-0.035em] text-zinc-900 tabular-nums">
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            'transition-transform duration-base ease-apple-pop group-hover:scale-[1.07]',
            TILES[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
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
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-32" />
    </Card>
  )
}
