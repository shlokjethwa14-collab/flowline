'use client'

import { LayoutGrid, List, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { KanbanBoard } from '@/components/tasks/kanban-board'
import { TaskCard, TaskCardSkeleton } from '@/components/tasks/task-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentUser, useVisibleTasks } from '@/hooks/use-flowline'
import { useProfiles } from '@/lib/data/queries'
import { TASK_STATUSES } from '@/lib/task-meta'
import type { Task } from '@/lib/types'
import { cn, isDueSoon, isOverdue } from '@/lib/utils'
import { useUIStore } from '@/store/ui'

const ALL_EMPLOYEES = 'all'

function matchesSearch(task: Task, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.description ?? '').toLowerCase().includes(needle) ||
    task.checklist.some((c) => c.label.toLowerCase().includes(needle))
  )
}

function ViewToggle() {
  const view = useUIStore((s) => s.allWorkView)
  const setView = useUIStore((s) => s.setAllWorkView)

  return (
    <div className="inset-well inline-flex h-10 items-center gap-1 rounded-xl p-1" role="group" aria-label="View style">
      {(
        [
          { value: 'list', label: 'List', icon: List },
          { value: 'kanban', label: 'Kanban', icon: LayoutGrid },
        ] as const
      ).map((option) => {
        const Icon = option.icon
        const active = view === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setView(option.value)}
            className={cn(
              'btn-3d inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-white text-zinc-900 shadow-raised' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function AllWorkPage() {
  const { isAdmin, isLoading: userLoading } = useCurrentUser()
  const { tasks, isLoading } = useVisibleTasks()
  const { data: profiles } = useProfiles()

  const view = useUIStore((s) => s.allWorkView)
  const search = useUIStore((s) => s.search)
  const setSearch = useUIStore((s) => s.setSearch)
  const employeeFilter = useUIStore((s) => s.employeeFilter)
  const setEmployeeFilter = useUIStore((s) => s.setEmployeeFilter)

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (!matchesSearch(task, search.trim())) return false
      if (isAdmin && employeeFilter !== ALL_EMPLOYEES && task.assigned_to !== employeeFilter) return false
      return true
    })
  }, [tasks, search, employeeFilter, isAdmin])

  const listSorted = useMemo(() => {
    const rank: Record<string, number> = { todo: 0, in_progress: 1, review: 2, done: 3 }
    return [...filtered].sort((a, b) => {
      if (a.is_blocked !== b.is_blocked) return a.is_blocked ? -1 : 1
      const aOver = isOverdue(a)
      const bOver = isOverdue(b)
      if (aOver !== bOver) return aOver ? -1 : 1
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
      return aDue - bDue
    })
  }, [filtered])

  const counts = useMemo(
    () => ({
      overdue: filtered.filter(isOverdue).length,
      dueSoon: filtered.filter(isDueSoon).length,
      blocked: filtered.filter((t) => t.is_blocked).length,
      byStatus: Object.fromEntries(
        TASK_STATUSES.map((s) => [s.value, filtered.filter((t) => t.status === s.value).length]),
      ) as Record<Task['status'], number>,
    }),
    [filtered],
  )

  const hasFilters = search.trim().length > 0 || (isAdmin && employeeFilter !== ALL_EMPLOYEES)
  const loading = isLoading || userLoading

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Work"
        description={
          isAdmin
            ? 'Every job in the company. Search it, filter by person, and drag work between stages on the board.'
            : 'Everything assigned to you. Drag a card on the board to change its stage.'
        }
        action={<ViewToggle />}
      />

      {/* Filters */}
      <section className="glass-panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="all-work-search">Search</Label>
          <div className="relative">
            <Input
              id="all-work-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, notes or checklist step…"
              className="pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-900/[.06] hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Employees never get a person filter — they only ever see their own work. */}
        {isAdmin && (
          <div className="w-full space-y-1.5 sm:w-60">
            <Label htmlFor="all-work-person">Person</Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger id="all-work-person">
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

        {hasFilters && (
          <Button
            variant="glass"
            onClick={() => {
              setSearch('')
              setEmployeeFilter(ALL_EMPLOYEES)
            }}
            className="gap-1.5 sm:mb-0"
          >
            <SlidersHorizontal />
            Clear
          </Button>
        )}
      </section>

      {/* Counters */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{filtered.length} shown</Badge>
          {TASK_STATUSES.map((status) => (
            <Badge key={status.value} variant="default">
              <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} aria-hidden="true" />
              {status.label} {counts.byStatus[status.value]}
            </Badge>
          ))}
          {counts.overdue > 0 && <Badge variant="danger">{counts.overdue} overdue</Badge>}
          {counts.dueSoon > 0 && <Badge variant="warning">{counts.dueSoon} due soon</Badge>}
          {counts.blocked > 0 && <Badge variant="danger">{counts.blocked} blocked</Badge>}
        </div>
      )}

      {/* Body */}
      {view === 'kanban' ? (
        <KanbanBoard tasks={filtered} isLoading={loading} showAssignee={isAdmin} />
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
                : 'Nothing has been assigned to you yet. It will show up the moment it is.'
          }
          action={
            hasFilters ? (
              <Button
                variant="glass"
                onClick={() => {
                  setSearch('')
                  setEmployeeFilter(ALL_EMPLOYEES)
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 stagger md:grid-cols-2 xl:grid-cols-3">
          {listSorted.map((task) => (
            <TaskCard key={task.id} task={task} showAssignee={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}
