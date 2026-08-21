'use client'

import { AlertTriangle, CalendarDays, CircleAlert, Clock, Hourglass, Repeat } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { statusMeta, taskTypeMeta } from '@/lib/task-meta'
import type { Task } from '@/lib/types'
import { cn, dueState, formatDate, formatTime } from '@/lib/utils'

export function TaskTypeChip({ type, className }: { type: Task['task_type']; className?: string }) {
  const meta = taskTypeMeta(type)
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ring-1 ring-inset',
        meta.chip,
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.2} />
      {meta.label}
    </span>
  )
}

export function StatusChip({ status, className }: { status: Task['status']; className?: string }) {
  const meta = statusMeta(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ring-1 ring-inset',
        meta.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/**
 * Deadline state, resolved against the user's own clock and calendar day.
 * Each state has its own icon and its own words — never colour alone, so it
 * still reads for colour-blind users and in a greyscale print of the report.
 */
export function DueBadge({ task }: { task: Task }) {
  const state = dueState(task)
  if (state === 'none' || !task.due_date) return null

  if (state === 'overdue') {
    return (
      <Badge variant="danger">
        <AlertTriangle className="h-3 w-3" />
        Overdue · was {formatTime(task.due_date)}
      </Badge>
    )
  }

  if (state === 'today') {
    return (
      <Badge variant="warning">
        <Clock className="h-3 w-3" />
        Today · {formatTime(task.due_date)}
      </Badge>
    )
  }

  if (state === 'due-soon') {
    return (
      <Badge variant="warning">
        <Hourglass className="h-3 w-3" />
        Tomorrow · {formatTime(task.due_date)}
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      <CalendarDays className="h-3 w-3" />
      {formatDate(task.due_date)}
    </Badge>
  )
}

export function BlockedBadge({ blocked }: { blocked: boolean }) {
  if (!blocked) return null
  return (
    <Badge variant="danger">
      <CircleAlert className="h-3 w-3" />
      Blocked
    </Badge>
  )
}

export function RoutineBadge({ task }: { task: Task }) {
  if (!task.routine_id) return null
  return (
    <Badge variant="primary">
      <Repeat className="h-3 w-3" />
      Daily
    </Badge>
  )
}
