'use client'

import { CalendarDays, CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { TaskCard } from '@/components/tasks/task-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/lib/data/queries'
import { resolveTaskMeta } from '@/lib/task-meta'
import type { Task } from '@/lib/types'
import { cn, formatFriendlyDay, humanMinutes, toDayKey, todayKey } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DayCell {
  key: string
  date: Date
  inMonth: boolean
  isToday: boolean
  tasks: Task[]
}

/** Six rows of seven, Monday-first, always the same height so nothing jumps. */
function buildMonth(year: number, month: number, byDay: Map<string, Task[]>): DayCell[] {
  const first = new Date(year, month, 1)
  // getDay() is Sunday-first; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  const today = todayKey()

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = toDayKey(date)
    return {
      key,
      date,
      inMonth: date.getMonth() === month,
      isToday: key === today,
      tasks: byDay.get(key) ?? [],
    }
  })
}

interface WorkCalendarProps {
  tasks: Task[]
  isLoading?: boolean
  /** Shown above the grid, e.g. whose calendar this is. */
  caption?: string
  className?: string
}

export function WorkCalendar({ tasks, isLoading = false, caption, className }: WorkCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selected, setSelected] = useState<string>(() => todayKey())
  const [dayOpen, setDayOpen] = useState(false)
  const { data: categories } = useCategories()

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      const when = task.due_date ?? task.created_at
      const key = toDayKey(when)
      const list = map.get(key)
      if (list) list.push(task)
      else map.set(key, [task])
    }
    for (const list of Array.from(map.values())) {
      list.sort((a: Task, b: Task) => {
        const aT = a.due_date ? new Date(a.due_date).getTime() : 0
        const bT = b.due_date ? new Date(b.due_date).getTime() : 0
        return aT - bT
      })
    }
    return map
  }, [tasks])

  const cells = useMemo(() => buildMonth(cursor.year, cursor.month, byDay), [cursor, byDay])
  const selectedTasks = byDay.get(selected) ?? []
  const totalMinutes = selectedTasks.reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0)
  const selectedDate = new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'full' })

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  function shiftMonth(by: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + by, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function goToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
    setSelected(todayKey())
  }

  if (isLoading) {
    return <Skeleton className={cn('h-[520px] w-full rounded-2xl', className)} />
  }

  return (
    <div className={className}>
      {/* ---- Month grid ------------------------------------------- */}
      <section className="glass-panel p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-[-0.014em] text-zinc-900">{monthLabel}</h2>
            {caption && <p className="mt-0.5 text-[12px] text-zinc-500">{caption}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="glass" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button variant="glass" size="sm" onClick={goToday} className="gap-1.5">
              <CalendarDays className="!size-3.5" />
              Today
            </Button>
            <Button variant="glass" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
        </header>

        <div className="mb-1.5 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const isSelected = cell.key === selected
            const count = cell.tasks.length
            const dots = cell.tasks.slice(0, 4)
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  setSelected(cell.key)
                  setDayOpen(true)
                }}
                aria-label={`${cell.date.toLocaleDateString(undefined, { dateStyle: 'full' })}, ${count} ${count === 1 ? 'job' : 'jobs'}`}
                aria-pressed={isSelected}
                className={cn(
                  'group relative flex aspect-square min-h-[44px] flex-col items-center justify-center gap-1 rounded-2xl p-1',
                  'transition-colors duration-200 ease-apple-snap',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  !cell.inMonth && 'opacity-45',
                  !isSelected && 'hover:bg-zinc-900/[.05]',
                )}
              >
                {/* A compact luminous disc, not a filled cell. It sits behind
                    the numeral so the grid keeps its rhythm whichever day is
                    chosen. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full',
                    'transition-[background-color,box-shadow,transform] duration-220 ease-apple-pop',
                    isSelected
                      ? 'scale-100 bg-[color:var(--accent)] shadow-[0_2px_10px_-2px_var(--glass-shadow),inset_0_1px_0_rgb(255_255_255/0.2)]'
                      : cell.isToday
                        ? 'bg-transparent shadow-[inset_0_0_0_1.5px_var(--accent)]'
                        : 'bg-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'text-[13px] tabular-nums',
                      isSelected
                        ? 'font-semibold text-[color:var(--text-on-accent)]'
                        : cell.isToday
                          ? 'font-semibold text-zinc-900'
                          : 'font-medium text-zinc-700',
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                </span>

                {/* Work indicator sits under the disc so it never competes
                    with the numeral for space. */}
                <span className="flex h-1.5 items-center gap-0.5">
                  {count > 0 &&
                    dots.map((t) => (
                      <span
                        key={t.id}
                        className={cn('h-1.5 w-1.5 rounded-full', resolveTaskMeta(t, categories ?? []).dot)}
                      />
                    ))}
                  {count > 4 && <span className="text-[9px] font-semibold text-zinc-500">+{count - 4}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---- Selected day, as a sheet over the month --------------- */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {formatFriendlyDay(selected)}
              <Badge variant={selectedTasks.length > 0 ? 'primary' : 'outline'}>
                {selectedTasks.length} {selectedTasks.length === 1 ? 'job' : 'jobs'}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedDate}
              {totalMinutes > 0 && ` · about ${humanMinutes(totalMinutes)} of work`}
            </DialogDescription>
          </DialogHeader>

          {selectedTasks.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="Nothing on this day"
              description="Anything scheduled for this day will appear here the moment it is assigned."
            />
          ) : (
            <div className="grid max-h-[60dvh] gap-3 overflow-y-auto pr-1 stagger">
              {selectedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
