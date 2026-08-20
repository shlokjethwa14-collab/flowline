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

export function isOverdue(task: Pick<Task, 'due_date' | 'status'>): boolean {
  if (!task.due_date || task.status === 'done') return false
  return new Date(task.due_date).getTime() < Date.now()
}

/** Due inside the next 24 hours (and not already past). */
export function isDueSoon(task: Pick<Task, 'due_date' | 'status'>): boolean {
  if (!task.due_date || task.status === 'done') return false
  const due = new Date(task.due_date).getTime()
  const now = Date.now()
  return due >= now && due - now <= 24 * 60 * 60 * 1000
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
