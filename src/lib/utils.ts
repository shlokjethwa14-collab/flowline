import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ChecklistItem, Task, TaskHandoff } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Stable id generator that works in the browser and in Node. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** Local calendar day as YYYY-MM-DD (never UTC-shifted). */
export function toDayKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey(): string {
  return toDayKey(new Date())
}

export function isSameDay(a: string | Date | null, b: string | Date | null): boolean {
  if (!a || !b) return false
  return toDayKey(a) === toDayKey(b)
}

export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`
}

export function formatFriendlyDay(dayKey: string): string {
  const today = todayKey()
  if (dayKey === today) return 'Today'
  const d = new Date(`${dayKey}T12:00:00`)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey === toDayKey(yesterday)) return 'Yesterday'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dayKey === toDayKey(tomorrow)) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "2h 40m", "3d 4h", "just now" — plain language, no clock jargon. */
export function humanDuration(ms: number): string {
  if (ms < 0) ms = 0
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours ? `${days}d ${remHours}h` : `${days}d`
}

export function timeAgo(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'just now'
  return `${humanDuration(diff)} ago`
}

/* ------------------------------------------------------------------ */
/* Task derivations                                                    */
/* ------------------------------------------------------------------ */

export type DueState = 'none' | 'overdue' | 'due-soon' | 'today' | 'upcoming'

/**
 * Classifies a deadline against the user's own clock and calendar day.
 *
 * Both halves matter. "Overdue" is an instant comparison — the moment has
 * passed. "Today" is a calendar-day comparison, because a job due at 18:00
 * is still today's problem at 09:00 and should not be filed alongside next
 * week's. Comparing only instants collapses those two into one another,
 * which is what made the badges misleading.
 */
export function dueState(task: Pick<Task, 'due_date' | 'status' | 'horizon'>): DueState {
  if (!task.due_date || task.status === 'done') return 'none'
  // Week and month commitments are not late until their period ends.
  if (task.horizon && task.horizon !== 'day') return 'none'

  const due = new Date(task.due_date)
  const now = Date.now()
  if (due.getTime() < now) return 'overdue'

  const dueKey = toDayKey(due)
  const today = todayKey()
  if (dueKey === today) return 'today'
  if (due.getTime() - now <= 24 * 60 * 60 * 1000) return 'due-soon'
  return 'upcoming'
}

export function isOverdue(task: Pick<Task, 'due_date' | 'status' | 'horizon'>): boolean {
  return dueState(task) === 'overdue'
}

/** Later today, or inside the next 24 hours. */
export function isDueSoon(task: Pick<Task, 'due_date' | 'status' | 'horizon'>): boolean {
  const state = dueState(task)
  return state === 'today' || state === 'due-soon'
}

export function checklistProgress(checklist: ChecklistItem[]): { done: number; total: number; percent: number } {
  const total = checklist.length
  const done = checklist.filter((c) => c.done).length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/** Wall-clock time the task has existed, frozen once it is completed. */
export function totalElapsedMs(task: Task): number {
  const start = new Date(task.created_at).getTime()
  const end = task.completed_at ? new Date(task.completed_at).getTime() : Date.now()
  return Math.max(0, end - start)
}

/** Time since the current owner picked it up — i.e. since the last handoff. */
export function currentOwnerMs(task: Task, handoffs: TaskHandoff[]): number {
  const forTask = handoffs
    .filter((h) => h.task_id === task.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const since = forTask.length > 0 ? forTask[0].created_at : task.created_at
  const start = new Date(since).getTime()
  const end = task.completed_at ? new Date(task.completed_at).getTime() : Date.now()
  return Math.max(0, end - start)
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/** Combine a YYYY-MM-DD day with an HH:MM time into a local ISO instant. */
export function combineDayAndTime(dayKey: string, time: string): string {
  const [h, m] = time.split(':').map((n) => Number.parseInt(n, 10))
  const d = new Date(`${dayKey}T00:00:00`)
  d.setHours(Number.isFinite(h) ? h : 17, Number.isFinite(m) ? m : 0, 0, 0)
  return d.toISOString()
}

/** Mon–Sat are working days; Sunday is not. Matches the SQL routine generator. */
export function isWorkingDay(dayKey: string): boolean {
  const d = new Date(`${dayKey}T12:00:00`)
  return d.getDay() !== 0
}

/* ------------------------------------------------------------------ */
/* Weeks and months                                                    */
/* ------------------------------------------------------------------ */

/**
 * Parses a YYYY-MM-DD key as a LOCAL date, anchored at midday.
 *
 * Two traps this avoids. `new Date('2026-08-28')` is parsed as UTC midnight
 * per spec, so west of Greenwich it is already the 27th locally — that is
 * exactly how "the 28th" becomes the wrong day. And anchoring at 00:00
 * instead of 12:00 puts the value within an hour of a DST boundary, where
 * adding days can land back on the same date. Midday is far from both.
 */
export function parseDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map((n) => Number.parseInt(n, 10))
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

export function addDaysKey(dayKey: string, days: number): string {
  const d = parseDayKey(dayKey)
  d.setDate(d.getDate() + days)
  return toDayKey(d)
}

/** The user's own IANA zone, so relative dates resolve where they are. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Monday-first, matching the calendar grid and how the week is worked. */
export function startOfWeekKey(value: string | Date = new Date()): string {
  const d = typeof value === 'string' ? parseDayKey(value) : new Date(value)
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift)
  return toDayKey(d)
}

export function endOfWeekKey(value: string | Date = new Date()): string {
  return addDaysKey(startOfWeekKey(value), 6)
}

export function startOfMonthKey(value: string | Date = new Date()): string {
  const d = typeof value === 'string' ? parseDayKey(value) : new Date(value)
  return toDayKey(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function endOfMonthKey(value: string | Date = new Date()): string {
  const d = typeof value === 'string' ? parseDayKey(value) : new Date(value)
  return toDayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function isWithin(dayKey: string, fromKey: string, toKey: string): boolean {
  return dayKey >= fromKey && dayKey <= toKey
}

/** Whole days left in the current week / month, counting today. */
export function daysLeftInPeriod(horizon: 'week' | 'month'): number {
  const end = horizon === 'week' ? endOfWeekKey() : endOfMonthKey()
  const a = parseDayKey(todayKey()).getTime()
  const b = parseDayKey(end).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1)
}

/** "45m", "1h 30m", "2h" — for planning a day, not for stopwatch precision. */
export function humanMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

/**
 * The tail of a sentence like "Calls recorded ___".
 *
 * `formatFriendlyDay` returns a standalone label ("Today", "12 August") that
 * reads wrong mid-sentence and, worse, was previously not used at all — the
 * heading said "today" regardless of which day was being viewed, which is
 * exactly backwards for a historical report.
 */
export function relativeDayPhrase(dayKey: string): string {
  const label = formatFriendlyDay(dayKey)
  if (label === 'Today') return 'today'
  if (label === 'Yesterday') return 'yesterday'
  if (label === 'Tomorrow') return 'tomorrow'
  return `on ${label}`
}
