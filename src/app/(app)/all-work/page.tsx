'use client'

import { LayoutGrid, List, Search, SearchX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { KanbanBoard } from '@/components/tasks/kanban-board'
import { StaggerGrid, StaggerItem } from '@/components/motion/stagger'
import { TaskCard, TaskCardSkeleton } from '@/components/tasks/task-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentUser, useVisibleTasks } from '@/hooks/use-flowline'
import { useProfiles } from '@/lib/data/queries'
import { TASK_STATUSES } from '@/lib/task-meta'
import type { Task } from '@/lib/types'
import { cn, dueState, isDueSoon, isOverdue } from '@/lib/utils'
import { useUIStore, type AllWorkView } from '@/store/ui'

const ALL_EMPLOYEES = 'all'

const VIEWS = [
  { value: 'list' as const, label: 'List', icon: List },
  { value: 'kanban' as const, label: 'Kanban', icon: LayoutGrid },
]

function matchesSearch(task: Task, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.description ?? '').toLowerCase().includes(needle) ||
    task.checklist.some((c) => c.label.toLowerCase().includes(needle))
  )
}

/**
 * Statistics, not controls. These used to look like filter chips and do
 * nothing when pressed; they are now plainly a read-out — no button
 * affordance, no hover state, and marked up as a description list.
 */
function Summary({ tasks }: { tasks: Task[] }) {
  const counts = useMemo(() => {
    const byStatus = TASK_STATUSES.map((s) => ({
      label: s.label,
      dot: s.dot,
      n: tasks.filter((t) => t.status === s.value).length,
    }))
    return {
      byStatus,
      overdue: tasks.filter(isOverdue).length,
      dueSoon: tasks.filter(isDueSoon).length,
      blocked: tasks.filter((t) => t.is_blocked).length,
    }
  }, [tasks])

  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[13px]">
      <div className="flex items-center gap-1.5">
        <dt className="text-zinc-500">Showing</dt>
        <dd className="font-semibold tabular-nums text-zinc-900">{tasks.length}</dd>
      </div>
      {counts.byStatus.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
          <dt className="text-zinc-500">{s.label}</dt>
          <dd className="font-medium tabular-nums text-zinc-700">{s.n}</dd>
        </div>
      ))}
      {counts.overdue > 0 && (
        <div className="flex items-center gap-1.5">
          <dt className="text-[color:var(--danger)]">Overdue</dt>
          <dd className="font-semibold tabular-nums text-[color:var(--danger)]">{counts.overdue}</dd>
        </div>
      )}
      {counts.blocked > 0 && (
        <div className="flex items-center gap-1.5">
          <dt className="text-[color:var(--warning)]">Blocked</dt>
          <dd className="font-semibold tabular-nums text-[color:var(--warning)]">{counts.blocked}</dd>
        </div>
      )}
    </dl>
  )
}

export default function AllWorkPage() {
  const { isAdmin, isLoading: userLoading } = useCurrentUser()
  const { tasks, isLoading } = useVisibleTasks()
  const { data: profiles } = useProfiles()

  const view = useUIStore((s) => s.allWorkView)
  const setView = useUIStore((s) => s.setAllWorkView)
  const search = useUIStore((s) => s.search)
  const setSearch = useUIStore((s) => s.setSearch)
  const employeeFilter = useUIStore((s) => s.employeeFilter)
  const setEmployeeFilter = useUIStore((s) => s.setEmployeeFilter)

  const searchRef = useRef<HTMLInputElement>(null)
  const [narrow, setNarrow] = useState(false)

  // Kanban on a phone means four stacked columns and a very long page, so
  // List is the sensible default there. Only forced once, on first mount,
  // so a deliberate switch to the board is respected.
  const forced = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    if (mq.matches && !forced.current) {
      forced.current = true
      setView('list')
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [setView])

  const filtered = useMemo(
    () =>
      tasks.filter((task) => {
        if (!matchesSearch(task, search.trim())) return false
        if (isAdmin && employeeFilter !== ALL_EMPLOYEES && task.assigned_to !== employeeFilter) return false
        return true
      }),
    [tasks, search, employeeFilter, isAdmin],
  )

  const listSorted = useMemo(() => {
    const rank: Record<string, number> = { todo: 0, in_progress: 1, review: 2, done: 3 }
    const urgency: Record<string, number> = { overdue: 0, today: 1, 'due-soon': 2, upcoming: 3, none: 4 }
    return [...filtered].sort((a, b) => {
      if (a.is_blocked !== b.is_blocked) return a.is_blocked ? -1 : 1
      const ua = urgency[dueState(a)]
      const ub = urgency[dueState(b)]
      if (ua !== ub) return ua - ub
      return rank[a.status] - rank[b.status]
    })
  }, [filtered])

  const hasFilters = search.trim().length > 0 || (isAdmin && employeeFilter !== ALL_EMPLOYEES)
  const loading = isLoading || userLoading

  function clearAll() {
    setSearch('')
    setEmployeeFilter(ALL_EMPLOYEES)
    searchRef.current?.focus()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="All Work"
        description={
          isAdmin
            ? 'Every job in the company. Search it, filter by person, and move work between stages.'
            : 'Everything assigned to you.'
        }
        action={
          <Segmented
            options={VIEWS}
            value={view}
            onChange={(v) => setView(v as AllWorkView)}
            label="Choose how to view the work"
          />
        }
      />

      {/* One search, not two. The top bar's field now only jumps here. */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Label htmlFor="work-search" className="sr-only">
            Search work
          </Label>
          <Input
            id="work-search"
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, notes or checklist step…"
            className="pl-11 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search && (
            <button
              type="button"
              onClick={clearAll}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900/[.06] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="sm:w-56">
            <Label htmlFor="work-person" className="sr-only">
              Filter by person
            </Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger id="work-person">
                <SelectValue placeholder="Everyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EMPLOYEES}>Everyone</SelectItem>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      {!loading && filtered.length > 0 && <Summary tasks={filtered} />}

      {view === 'kanban' ? (
        <KanbanBoard tasks={filtered} isLoading={loading} showAssignee={isAdmin} narrow={narrow} />
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <TaskCardSkeleton key={i} />
          ))}
        </div>
      ) : listSorted.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={hasFilters ? 'Nothing matches that' : 'No work here yet'}
          description={
            hasFilters
              ? 'Try a shorter search, or clear the filters to see everything again.'
              : isAdmin
                ? 'Assign the first job from the Assign Work tab and it will appear here.'
                : 'Nothing has been assigned to you yet.'
          }
          action={
            hasFilters ? (
              <Button variant="glass" onClick={clearAll}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <StaggerGrid
          // Keyed on the filter signature so a new result set replays the
          // stagger — it is the clearest signal that the list actually
          // changed when only a couple of cards differ.
          key={listSorted.length}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {listSorted.map((task) => (
            <StaggerItem key={task.id}>
              <TaskCard task={task} showAssignee={isAdmin} />
            </StaggerItem>
          ))}
        </StaggerGrid>
      )}
    </div>
  )
}
