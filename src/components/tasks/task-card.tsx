'use client'

import { BookOpen, CheckCircle2, ListChecks, Mic, RotateCw, Target, Timer } from 'lucide-react'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileMap } from '@/hooks/use-flowline'
import { useSpecular } from '@/hooks/use-specular'
import { useCategories, useUpdateTaskStatus } from '@/lib/data/queries'
import { resolveTaskMeta, TASK_STATUSES } from '@/lib/task-meta'
import type { Task, TaskStatus } from '@/lib/types'
import { checklistProgress, cn, dueState, humanMinutes } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { Tilt } from '@/components/motion/tilt'
import { BlockedBadge, DueBadge, RoutineBadge, StatusChip } from './task-badges'

interface TaskCardProps {
  task: Task
  showAssignee?: boolean
  compact?: boolean
  /** Adds a keyboard-and-touch way to change stage, for the Kanban board. */
  showStagePicker?: boolean
  className?: string
}

/**
 * The whole card opens the task, but only ONE element is interactive for
 * that: the title button, stretched over the card by a pseudo-element. The
 * old version put `role="button"` on the container, which meant any control
 * added inside became a nested interactive — invalid, and unusable with a
 * screen reader. Controls that need their own action sit above the stretched
 * layer on the z-axis.
 *
 * Material is deliberately quiet. These appear dozens at a time, so they use
 * the cheap glass; navigation and overlays keep the strong material, and that
 * contrast is what keeps the page readable.
 */
export function TaskCard({
  task,
  showAssignee = true,
  compact = false,
  showStagePicker = false,
  className,
}: TaskCardProps) {
  const openTask = useUIStore((s) => s.openTask)
  const profiles = useProfileMap()
  const { data: categories } = useCategories()
  const updateStatus = useUpdateTaskStatus()
  const { specRef, onPointerMove, onPointerLeave } = useSpecular<HTMLElement>()

  const assignee = task.assigned_to ? (profiles.get(task.assigned_to) ?? null) : null
  const progress = checklistProgress(task.checklist)
  const state = dueState(task)
  const done = task.status === 'done'
  const meta = resolveTaskMeta(task, categories ?? [])
  const Icon = meta.icon

  const railTone = done
    ? 'bg-[color:var(--success)]'
    : task.is_blocked
      ? 'bg-[color:var(--danger)]'
      : state === 'overdue'
        ? 'bg-[color:var(--warning)]'
        : null

  return (
    <Tilt degrees={4} liftPx={14} className="h-full">
      <article
        ref={specRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn(
          'glass glass-quiet spec group relative h-full overflow-hidden rounded-3xl p-4',
          done && 'opacity-[0.86]',
          className,
        )}
      >
      {railTone && (
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-4 left-0 w-[3px] rounded-r-full', railTone)}
        />
      )}

      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl',
            compact ? 'h-8 w-8' : 'h-9 w-9',
            meta.tile,
          )}
        >
          <Icon className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} strokeWidth={2.1} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{meta.label}</p>
          {/* The only element that opens the task. `after:` stretches its hit
              area over the whole card without nesting anything. */}
          <button
            type="button"
            onClick={() => openTask(task.id)}
            className={cn(
              'mt-0.5 block w-full text-left font-semibold leading-snug tracking-[-0.011em] text-zinc-900 text-pretty',
              'after:absolute after:inset-0 after:content-[""] after:rounded-3xl',
              'focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background',
              compact ? 'text-[14px]' : 'text-[15px]',
              done && 'text-zinc-500 line-through decoration-zinc-400',
            )}
          >
            {task.title}
          </button>
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
        {task.rollover_count > 0 && !done && (
          <Badge variant={task.rollover_count >= 3 ? 'danger' : 'warning'}>
            <RotateCw className="h-3 w-3" />
            Carried {task.rollover_count}×
          </Badge>
        )}
        {task.call_log_id && (
          <Badge variant="outline">
            <Mic className="h-3 w-3" />
            From a call
          </Badge>
        )}
        {task.sop && (
          <Badge variant="outline">
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
          <Badge variant="success">
            <CheckCircle2 className="h-3 w-3" />
            Done
          </Badge>
        ) : (
          <DueBadge task={task} />
        )}
      </div>

      {!compact && task.description && (
        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-600">{task.description}</p>
      )}

      {progress.total > 0 && (
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[12px] text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-zinc-500" />
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
            aria-label={`Checklist: ${progress.done} of ${progress.total} steps finished`}
          />
        </div>
      )}

      <div className="mt-3.5 flex items-center gap-2.5">
        {showAssignee && (
          <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar profile={assignee} className="h-6 w-6" />
            <span className="truncate text-[12.5px] text-zinc-600">{assignee?.full_name ?? 'Unassigned'}</span>
          </div>
        )}

        <div className="relative z-[1] ml-auto shrink-0">
          {showStagePicker ? (
            <>
              {/* Dragging is not available to keyboard or screen-reader
                  users, so the stage is also a real form control. */}
              <label htmlFor={`stage-${task.id}`} className="sr-only">
                Stage for {task.title}
              </label>
              <select
                id={`stage-${task.id}`}
                value={task.status}
                onChange={(e) => updateStatus.mutate({ taskId: task.id, status: e.target.value as TaskStatus })}
                className={cn(
                  'h-8 min-w-[104px] cursor-pointer rounded-full px-3 text-[12px] font-medium',
                  'bg-[var(--glass-surface-raised)] text-zinc-700',
                  'shadow-[0_0_0_0.5px_var(--glass-border),inset_0_1px_0_var(--glass-highlight)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <StatusChip status={task.status} />
          )}
          </div>
        </div>
      </article>
    </Tilt>
  )
}

export function TaskCardSkeleton() {
  return (
    <div className="glass glass-quiet rounded-3xl p-4">
      <div className="flex items-start gap-2.5">
        <Skeleton className="h-9 w-9 rounded-2xl" />
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
      </div>
    </div>
  )
}
