'use client'

import { CheckCircle2, ListChecks } from 'lucide-react'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileMap } from '@/hooks/use-flowline'
import type { Task } from '@/lib/types'
import { checklistProgress, cn, isOverdue } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { BlockedBadge, DueBadge, RoutineBadge, StatusChip, TaskTypeChip } from './task-badges'

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
  const assignee = task.assigned_to ? (profiles.get(task.assigned_to) ?? null) : null
  const progress = checklistProgress(task.checklist)
  const overdue = isOverdue(task)
  const done = task.status === 'done'

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
        'relative overflow-hidden p-4',
        // A hairline of colour on the left tells the state at a glance.
        'before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:transition-colors',
        done
          ? 'before:bg-emerald-400/70'
          : task.is_blocked
            ? 'before:bg-red-400/80'
            : overdue
              ? 'before:bg-amber-400/80'
              : 'before:bg-transparent',
        done && 'opacity-[0.82]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskTypeChip type={task.task_type} />
        <RoutineBadge task={task} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <BlockedBadge blocked={task.is_blocked} />
          {!done && <DueBadge task={task} />}
          {done && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium leading-none text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
              <CheckCircle2 className="h-3 w-3" />
              Done
            </span>
          )}
        </div>
      </div>

      <h3
        className={cn(
          'mt-3 text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900 text-pretty',
          done && 'text-zinc-500 line-through decoration-zinc-300',
          compact && 'text-[13.5px]',
        )}
      >
        {task.title}
      </h3>

      {!compact && task.description && (
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500">{task.description}</p>
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
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="ml-auto h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
      <div className="mt-4 flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-5 w-20 rounded-full" />
      </div>
    </Card>
  )
}
