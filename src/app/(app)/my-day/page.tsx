'use client'

import { CalendarRange, CheckCircle2, ListChecks, PartyPopper, Sunrise, Target } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard, StatCardSkeleton } from '@/components/shared/stat-card'
import { TaskCard, TaskCardSkeleton } from '@/components/tasks/task-card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useCurrentUser, useVisibleTasks } from '@/hooks/use-flowline'
import { MY_DAY_GROUPS } from '@/lib/task-meta'
import type { Task } from '@/lib/types'
import { checklistProgress, daysLeftInPeriod, formatFriendlyDay, isOverdue, isSameDay, todayKey } from '@/lib/utils'

/** Today's work plus anything still unfinished from before. */
function isOnMyDay(task: Task): boolean {
  // Week and month commitments live in their own sections, not today's list.
  if (task.horizon !== 'day') return false
  if (task.status === 'done') return isSameDay(task.completed_at ?? task.due_date, new Date())
  if (isOverdue(task)) return true
  if (!task.due_date) return isSameDay(task.created_at, new Date())
  return isSameDay(task.due_date, new Date())
}

/** Work committed to this week or this month, with the time left to do it. */
function PeriodSection({ horizon, tasks }: { horizon: 'week' | 'month'; tasks: Task[] }) {
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.status === 'done').length
  const percent = Math.round((done / tasks.length) * 100)
  const left = daysLeftInPeriod(horizon)
  const label = horizon === 'week' ? 'This week' : 'This month'

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.011em] text-zinc-800">
          <Target className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
          {label}
        </h2>
        <Badge variant={percent === 100 ? 'success' : 'primary'}>
          {done}/{tasks.length} done
        </Badge>
        <Badge variant={left <= 2 && percent < 100 ? 'danger' : 'outline'}>
          {left} {left === 1 ? 'day' : 'days'} left
        </Badge>
        <div className="ml-auto hidden w-40 sm:block">
          <Progress
            value={percent}
            complete={percent >= 100}
            className="h-1.5"
            aria-label={`${label}: ${done} of ${tasks.length} finished`}
          />
        </div>
      </div>
      <div className="grid gap-3 stagger md:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} showAssignee={false} />
        ))}
      </div>
    </section>
  )
}

export default function MyDayPage() {
  const { profile, isAdmin, isLoading: userLoading } = useCurrentUser()
  const { tasks, isLoading } = useVisibleTasks()

  // This screen is always personal. For an admin `useVisibleTasks` returns the
  // whole company, so narrow to what they actually own themselves.
  const mine = useMemo(
    () => (profile ? tasks.filter((t) => t.assigned_to === profile.id) : []),
    [tasks, profile],
  )

  const dayTasks = useMemo(() => mine.filter(isOnMyDay), [mine])
  const weekTasks = useMemo(() => mine.filter((t) => t.horizon === 'week'), [mine])
  const monthTasks = useMemo(() => mine.filter((t) => t.horizon === 'month'), [mine])

  const stats = useMemo(() => {
    const total = dayTasks.length
    const done = dayTasks.filter((t) => t.status === 'done').length
    const overdue = dayTasks.filter((t) => isOverdue(t)).length
    const blocked = dayTasks.filter((t) => t.is_blocked).length
    const checklistTotals = dayTasks.reduce(
      (acc, t) => {
        const p = checklistProgress(t.checklist)
        return { done: acc.done + p.done, total: acc.total + p.total }
      },
      { done: 0, total: 0 },
    )
    return {
      total,
      done,
      overdue,
      blocked,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      checklistTotals,
    }
  }, [dayTasks])

  /** Everything of mine still open, regardless of date — the forward look. */
  const upcoming = useMemo(
    () =>
      mine
        .filter((t) => t.status !== 'done' && t.due_date && new Date(t.due_date).getTime() > Date.now())
        .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime())
        .slice(0, 5),
    [mine],
  )

  const groups = useMemo(
    () =>
      MY_DAY_GROUPS.map((group) => ({
        ...group,
        tasks: dayTasks
          .filter((t) => group.types.includes(t.task_type))
          .sort((a, b) => {
            // Unfinished first, then by deadline.
            if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
            const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
            const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
            return aDue - bDue
          }),
      })),
    [dayTasks],
  )

  const firstName = profile?.full_name.split(' ')[0] ?? 'there'
  const everythingDone = stats.total > 0 && stats.done === stats.total
  const loading = isLoading || userLoading

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Good day, ${firstName}`}
        description={`${formatFriendlyDay(todayKey())} — ${isAdmin ? 'the work you are carrying yourself' : 'here is everything that needs you'}. Tap any job to open it.`}
      />

      {/* Day progress */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 stagger sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Day progress"
            value={`${stats.percent}%`}
            icon={CheckCircle2}
            tone={everythingDone ? 'success' : 'primary'}
            percent={stats.percent}
            hint={`${stats.done} of ${stats.total} finished`}
          />
          <StatCard
            label="Checklist steps"
            value={`${stats.checklistTotals.done}/${stats.checklistTotals.total}`}
            icon={ListChecks}
            tone="neutral"
            hint="Small steps ticked off today"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            icon={Sunrise}
            tone={stats.overdue > 0 ? 'warning' : 'neutral'}
            hint={stats.overdue > 0 ? 'Left over from earlier — clear these first' : 'Nothing left over'}
          />
          <StatCard
            label="Blocked"
            value={stats.blocked}
            icon={PartyPopper}
            tone={stats.blocked > 0 ? 'danger' : 'neutral'}
            hint={stats.blocked > 0 ? 'Waiting on someone else' : 'Nothing is stuck'}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, groupIndex) => (
            <section key={groupIndex} className="space-y-3">
              <div className="skeleton h-4 w-28" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </div>
            </section>
          ))}
        </div>
      ) : stats.total === 0 ? (
        <EmptyState
          icon={Sunrise}
          title="Nothing on your plate today"
          description="No work is due today and nothing is left over. If something comes up, it will appear here straight away."
          className="mt-4"
        />
      ) : everythingDone ? (
        <EmptyState
          icon={PartyPopper}
          tone="success"
          title="Everything is finished — well done"
          description={`All ${stats.total} jobs for today are closed. Anything new that comes in will show up here.`}
          className="mt-4"
        />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => {
            if (group.tasks.length === 0) return null
            const Icon = group.icon
            const groupDone = group.tasks.filter((t) => t.status === 'done').length
            const groupPercent = Math.round((groupDone / group.tasks.length) * 100)

            return (
              <section key={group.key} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-zinc-800">
                    <Icon className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
                    {group.label}
                  </h2>
                  <Badge variant={groupPercent === 100 ? 'success' : 'default'}>
                    {groupDone}/{group.tasks.length} done
                  </Badge>
                  <div className="ml-auto hidden w-40 sm:block">
                    <Progress
                      value={groupPercent}
                      complete={groupPercent >= 100}
                      className="h-1.5"
                      aria-label={`${group.label}: ${groupDone} of ${group.tasks.length} finished`}
                    />
                  </div>
                </div>

                <div className="grid gap-3 stagger md:grid-cols-2 xl:grid-cols-3">
                  {group.tasks.map((task) => (
                    <TaskCard key={task.id} task={task} showAssignee={false} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Commitments for the period, kept apart from today's list. */}
      {!loading && (
        <>
          <PeriodSection horizon="week" tasks={weekTasks} />
          <PeriodSection horizon="month" tasks={monthTasks} />
        </>
      )}

      {/* What is coming — the forward look, so today is not the whole world. */}
      {!loading && upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.011em] text-zinc-800">
              <CalendarRange className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
              Coming up
            </h2>
            <Badge variant="outline">next {upcoming.length}</Badge>
            <Link
              href="/calendar"
              className="ml-auto text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Open calendar
            </Link>
          </div>
          <div className="grid gap-3 stagger md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((task) => (
              <TaskCard key={task.id} task={task} showAssignee={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
