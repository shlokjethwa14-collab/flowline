'use client'

import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Plus,
  Repeat,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { AdminOnly } from '@/components/shell/role-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProfileMap } from '@/hooks/use-flowline'
import {
  useCategories,
  useDeleteRoutine,
  useProfiles,
  useRoutines,
  useSetRoutineActive,
  useTasks,
} from '@/lib/data/queries'
import { resolveTaskMeta } from '@/lib/task-meta'
import type { Profile, Task } from '@/lib/types'
import { cn, humanMinutes, isSameDay, pluralize } from '@/lib/utils'
import { useUIStore } from '@/store/ui'

interface PersonSummary {
  profile: Profile
  open: number
  dueToday: number
  doneToday: number
  percent: number
}

function summarise(profiles: Profile[], tasks: Task[]): PersonSummary[] {
  const today = new Date()
  return profiles
    .map((profile) => {
      const mine = tasks.filter((t) => t.assigned_to === profile.id)
      const open = mine.filter((t) => t.status !== 'done').length
      const todays = mine.filter((t) => isSameDay(t.due_date, today) || isSameDay(t.created_at, today))
      const doneToday = todays.filter((t) => t.status === 'done').length
      const percent = todays.length === 0 ? 0 : Math.round((doneToday / todays.length) * 100)
      return { profile, open, dueToday: todays.length, doneToday, percent }
    })
    .sort((a, b) => b.open - a.open || a.profile.full_name.localeCompare(b.profile.full_name))
}

function PersonCard({ summary }: { summary: PersonSummary }) {
  const openAssign = useUIStore((s) => s.openAssign)
  const { profile, open, dueToday, doneToday, percent } = summary

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      onClick={() => openAssign(profile.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openAssign(profile.id)
        }
      }}
      aria-label={`Assign work to ${profile.full_name}`}
      className="group p-5"
    >
      <div className="flex items-start gap-3">
        <PersonAvatar profile={profile} className="h-12 w-12" ring />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">
            {profile.full_name}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-zinc-500">{profile.job_title ?? 'Team member'}</p>
        </div>
        {profile.role === 'admin' && <Badge variant="primary">Admin</Badge>}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px]">
        <Badge variant={open === 0 ? 'success' : 'warning'}>
          {open} {pluralize(open, 'open job')}
        </Badge>
        {dueToday > 0 && (
          <Badge variant="outline">
            <CheckCircle2 className="h-3 w-3" />
            {doneToday}/{dueToday} today
          </Badge>
        )}
      </div>

      {dueToday > 0 && (
        <Progress
          value={percent}
          complete={percent >= 100}
          className="mt-3 h-1.5"
          aria-label={`${profile.full_name} finished ${doneToday} of ${dueToday} today`}
        />
      )}

      <div
        className={cn(
          'mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-200 py-2',
          'text-[12.5px] text-zinc-400 transition-colors',
          'group-hover:border-primary/30 group-hover:bg-primary/[.04] group-hover:text-primary',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Assign work
      </div>
    </Card>
  )
}

function RoutinesPanel() {
  const { data: routines, isLoading } = useRoutines()
  const { data: categories } = useCategories()
  const profiles = useProfileMap()
  const setActive = useSetRoutineActive()
  const removeRoutine = useDeleteRoutine()

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-[68px] w-full rounded-xl" />
        <Skeleton className="h-[68px] w-full rounded-xl" />
      </div>
    )
  }

  const list = routines ?? []

  if (list.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="No daily routines yet"
        description="When you assign work and choose “Every day”, it shows up here and a fresh copy is created each working morning."
      />
    )
  }

  return (
    <ul className="space-y-2">
      {list.map((routine) => {
        const owner = routine.assigned_to ? (profiles.get(routine.assigned_to) ?? null) : null
        const meta = resolveTaskMeta({ task_type: routine.task_type, category_id: routine.category_id }, categories ?? [])
        const Icon = meta.icon
        return (
          <li
            key={routine.id}
            className={cn(
              'glass-panel flex flex-wrap items-center gap-3 p-3.5 transition-opacity',
              !routine.active && 'opacity-60',
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
                meta.chip,
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-zinc-900">{routine.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <PersonAvatar profile={owner} className="h-4 w-4" />
                  {owner?.full_name ?? 'Unassigned'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Every working day at {routine.due_time}
                </span>
                {routine.estimated_minutes ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-zinc-600">
                      <Timer className="h-3 w-3" />
                      takes about {humanMinutes(routine.estimated_minutes)}
                    </span>
                  </>
                ) : null}
                {routine.sop ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      has a procedure
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="hidden text-[12px] font-medium text-zinc-500 sm:inline">
                {routine.active ? 'Running' : 'Paused'}
              </span>
              {/* Not wrapped in a Tooltip: Radix's trigger sets its own
                  data-state, which would overwrite the switch's checked
                  state and stop the on-style ever applying. */}
              <Switch
                tone="green"
                checked={routine.active}
                disabled={setActive.isPending}
                onCheckedChange={(next) => setActive.mutate({ routineId: routine.id, active: next })}
                aria-label={routine.active ? `Pause ${routine.title}` : `Start ${routine.title}`}
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="glass"
                    size="icon-sm"
                    className="text-zinc-400 hover:text-red-600"
                    disabled={removeRoutine.isPending}
                    onClick={() => removeRoutine.mutate({ routineId: routine.id })}
                    aria-label={`Remove ${routine.title}`}
                  >
                    {removeRoutine.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove this routine</TooltipContent>
              </Tooltip>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function AssignContent() {
  const { data: profiles, isLoading } = useProfiles()
  const { data: tasks } = useTasks()
  const openAssign = useUIStore((s) => s.openAssign)

  const summaries = useMemo(() => summarise(profiles ?? [], tasks ?? []), [profiles, tasks])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Assign Work"
        description="Pick a person and give them a job. Choosing the kind of work fills in a checklist for you."
        action={
          <Button onClick={() => openAssign(null)} className="gap-1.5">
            <Plus />
            New work
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-400">Your team</h2>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[212px] w-full rounded-2xl" />
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody on the team yet"
            description="Add your first teammate from Team Flow, then you can start handing out work."
          />
        ) : (
          <div className="grid gap-3 stagger sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summaries.map((summary) => (
              <PersonCard key={summary.profile.id} summary={summary} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-400">Daily routines</h2>
          <span className="text-[12px] text-zinc-400">— work that repeats every day on its own</span>
        </div>
        <RoutinesPanel />
      </section>
    </div>
  )
}

export default function AssignPage() {
  return (
    <AdminOnly
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[212px] w-full rounded-2xl" />
            ))}
          </div>
        </div>
      }
    >
      <AssignContent />
    </AdminOnly>
  )
}
