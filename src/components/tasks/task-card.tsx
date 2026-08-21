'use client'

import { BookOpen, CheckCircle2, ListChecks, Mic, RotateCw, Target, Timer } from 'lucide-react'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileMap } from '@/hooks/use-flowline'
import { useCategories } from '@/lib/data/queries'
import { resolveTaskMeta } from '@/lib/task-meta'
import type { Task } from '@/lib/types'
import { checklistProgress, cn, humanMinutes, isOverdue } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { BlockedBadge, DueBadge, RoutineBadge, StatusChip } from './task-badges'

interface TaskCardProps {
  task: Task
  /** Hides the assignee row on screens where every task is the same person's. */
  showAssignee?: boolean
  /** Compact treatment used inside Kanban columns. */
  compact?: boolean
  className?: string
}

export function TaskCard({ task, showAssignee = true, compact = false, className }: TaskCardProps) {
  const openTask = useUIStore((s) => s.openTask)
  const profiles = useProfileMap()
  const { data: categories } = useCategories()
  const assignee = task.assigned_to ? (profiles.get(task.assigned_to) ?? null) : null
  const progress = checklistProgress(task.checklist)
  const overdue = isOverdue(task)
  const done = task.status === 'done'
  const meta = resolveTaskMeta(task, categories ?? [])
  const Icon = meta.icon

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.title}`}
      onClick={() => openTask(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openTask(task.id)
        }
      }}
      className={cn(
        // The bloom sits behind the glass and only lights on hover.
        'bloom-host group relative p-4',
        meta.bloom,
        done && 'opacity-[0.84] saturate-[0.85]',
        className,
      )}
    >
      {/* State rail — a lit edge along the left, brighter than a border. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-4 left-0 w-[3px] rounded-r-full transition-opacity duration-base ease-apple',
          done
            ? 'bg-[linear-gradient(180deg,hsl(158_70%_62%),hsl(160_66%_48%))] shadow-[0_0_10px_hsl(158_70%_55%/0.7)]'
            : task.is_blocked
              ? 'bg-[linear-gradient(180deg,hsl(4_88%_68%),hsl(4_78%_54%))] shadow-[0_0_10px_hsl(4_84%_60%/0.7)]'
              : overdue
                ? 'bg-[linear-gradient(180deg,hsl(38_96%_66%),hsl(28_92%_56%))] shadow-[0_0_10px_hsl(34_94%_60%/0.7)]'
                : 'opacity-0',
        )}
      />

      <div className="flex items-start gap-2.5">
        {/* Raised icon tile — thickness and glow, per the reference sheet. */}
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-[11px]',
            'transition-transform duration-base ease-apple-pop group-hover:scale-[1.07]',
            compact ? 'h-7 w-7' : 'h-8 w-8',
            meta.tile,
          )}
        >
          <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.1} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{meta.label}</p>
          <h3
            className={cn(
              'mt-0.5 font-semibold leading-snug tracking-[-0.011em] text-zinc-900 text-pretty',
              compact ? 'text-[13.5px]' : 'text-[14.5px]',
              done && 'text-zinc-500 line-through decoration-zinc-300',
            )}
          >
            {task.title}
          </h3>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <RoutineBadge task={task} />
        {task.horizon !== 'day' && (
          <Badge variant="primary">
            <Target className="h-3 w-3" />
            {task.horizon === 'week' ? 'This week' : 'This month'}
          </Badge>
        )}
        {task.rollover_count > 0 && task.status !== 'done' && (
          <Badge
            variant={task.rollover_count >= 3 ? 'danger' : 'warning'}
            title={
              task.original_due_date
                ? `Originally due ${task.original_due_date}. Carried forward ${task.rollover_count} times.`
                : undefined
            }
          >
            <RotateCw className="h-3 w-3" />
            Carried {task.rollover_count}×
          </Badge>
        )}
        {task.call_log_id && (
          <Badge variant="outline" title="Created from a promise made on a call">
            <Mic className="h-3 w-3" />
            From a call
          </Badge>
        )}
        {task.sop && (
          <Badge variant="outline" title="This job has a written procedure">
            <BookOpen className="h-3 w-3" />
            SOP
          </Badge>
        )}
        {task.estimated_minutes ? (
          <Badge variant="outline">
            <Timer className="h-3 w-3" />
            {humanMinutes(task.estimated_minutes)}
          </Badge>
        ) : null}
        <BlockedBadge blocked={task.is_blocked} />
        {done ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium leading-none text-emerald-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] ring-1 ring-inset ring-emerald-300/60">
            <CheckCircle2 className="h-3 w-3" />
            Done
          </span>
        ) : (
          <DueBadge task={task} />
        )}
      </div>

      {!compact && task.description && (
        <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500">{task.description}</p>
      )}

      {progress.total > 0 && (
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11.5px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-zinc-400" />
              Checklist
            </span>
            <span className="font-medium tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
          <Progress
            value={progress.percent}
            complete={progress.percent >= 100}
            className="h-1.5"
            aria-label={`Checklist ${progress.done} of ${progress.total} finished`}
          />
        </div>
      )}

      <div className="mt-3.5 flex items-center gap-2.5">
        {showAssignee && (
          <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar profile={assignee} className="h-6 w-6" />
            <span className="truncate text-[12px] text-zinc-500">{assignee?.full_name ?? 'Unassigned'}</span>
          </div>
        )}
        <div className="ml-auto shrink-0">
          <StatusChip status={task.status} />
        </div>
      </div>
    </Card>
  )
}

export function TaskCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-2.5">
        <Skeleton className="h-8 w-8 rounded-[11px]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <Skeleton className="mt-3 h-5 w-24 rounded-full" />
      <Skeleton className="mt-3 h-3 w-1/2" />
      <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
      <div className="mt-4 flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-5 w-20 rounded-full" />
      </div>
    </Card>
  )
}
