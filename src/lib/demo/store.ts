'use client'

import type {
  ActivityLog,
  CallCommitment,
  CallLog,
  CreateTaskInput,
  AddEmployeeInput,
  Profile,
  SaveCallInput,
  SaveCategoryInput,
  Task,
  TaskCategory,
  TaskEvent,
  TaskHandoff,
  TaskRoutine,
  TaskStatus,
  TaskType,
} from '@/lib/types'
import { combineDayAndTime, isWorkingDay, startOfWeekKey, toDayKey, todayKey, uid } from '@/lib/utils'
import { buildDemoDataset, DEMO_EMPLOYEE_ID, DEMO_OWNER_ID, type DemoDataset } from './dataset'

/**
 * Bumped whenever the demo shape changes.
 *
 * v4 adds the event log and blocked reasons. Reading a v3 payload would
 * resurrect a blocked task with no reason — a row the database now refuses
 * to store — and demo mode must never be able to show a state production
 * rejects. Stale payloads are discarded rather than migrated: this is seed
 * data, and a wrong migration is worse than a clean reseed.
 */
const STORAGE_KEY = 'flowline.demo.v4'
const PREVIEW_KEY = 'flowline.demo.previewing'

interface PersistedShape extends DemoDataset {
  previewUserId: string
}

let state: DemoDataset | null = null
let previewUserId: string = DEMO_OWNER_ID
const listeners = new Set<() => void>()

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function persist(): void {
  if (!isBrowser() || !state) return
  try {
    const payload: PersistedShape = { ...state, previewUserId }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.localStorage.setItem(PREVIEW_KEY, previewUserId)
  } catch {
    // A full or blocked localStorage must never break the demo — it just
    // means the session is not remembered across refreshes.
  }
}

function readPersisted(): PersistedShape | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    if (!parsed || !Array.isArray(parsed.profiles) || !Array.isArray(parsed.tasks)) return null
    return {
      profiles: parsed.profiles,
      categories: parsed.categories ?? [],
      tasks: parsed.tasks,
      activity: parsed.activity ?? [],
      handoffs: parsed.handoffs ?? [],
      routines: parsed.routines ?? [],
      calls: parsed.calls ?? [],
      events: parsed.events ?? [],
      previewUserId: parsed.previewUserId ?? DEMO_OWNER_ID,
    }
  } catch {
    return null
  }
}

function ensure(): DemoDataset {
  if (state) return state
  const persisted = readPersisted()
  if (persisted) {
    const { previewUserId: pid, ...rest } = persisted
    state = rest
    previewUserId = pid
  } else {
    state = buildDemoDataset()
    previewUserId = DEMO_OWNER_ID
    persist()
  }
  runRoutineGeneration()
  runRollover()
  return state
}

function notify(): void {
  persist()
  for (const listener of Array.from(listeners)) listener()
}

/** Subscribe to any change — this is what stands in for Supabase Realtime. */
export function subscribeDemo(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function demoProfiles(): Profile[] {
  return [...ensure().profiles]
}

export function demoTasks(): Task[] {
  return [...ensure().tasks]
}

export function demoActivity(): ActivityLog[] {
  return [...ensure().activity]
}

export function demoHandoffs(): TaskHandoff[] {
  return [...ensure().handoffs]
}

export function demoRoutines(): TaskRoutine[] {
  return [...ensure().routines]
}

export function demoCategories(): TaskCategory[] {
  return [...ensure().categories]
}

export function demoCalls(): CallLog[] {
  return [...ensure().calls]
}

export function demoSaveCall(input: SaveCallInput): CallLog {
  const data = ensure()
  const now = new Date().toISOString()
  const call: CallLog = {
    id: uid(),
    task_id: input.task_id ?? null,
    counterparty: input.counterparty.trim(),
    recorded_by: previewUserId,
    duration_seconds: input.duration_seconds ?? null,
    transcript: input.transcript,
    summary: input.summary,
    commitments: input.commitments,
    intel: input.intel,
    created_at: now,
  }
  data.calls.push(call)

  // Every commitment the owner kept becomes real, dated work.
  for (const commitment of call.commitments) {
    if (!commitment.due_date) continue
    const task: Task = {
      id: uid(),
      title: commitment.title,
      description: `From the call with ${call.counterparty}. They said: “${commitment.quote}”`,
      status: 'todo',
      assigned_to: input.assign_to ?? previewUserId,
      created_by: previewUserId,
      due_date: combineDayAndTime(commitment.due_date, commitment.due_time ?? '11:00'),
      is_blocked: false,
      blocked_reason: null,
      blocked_by: null,
      blocked_at: null,
      status_changed_at: now,
      completed_at: null,
      task_type: commitmentTaskType(commitment.kind),
      checklist: [],
      sop: null,
      estimated_minutes: null,
      category_id: null,
      horizon: 'day',
      original_due_date: null,
      rollover_count: 0,
      call_log_id: call.id,
      routine_id: null,
      routine_on: null,
      created_at: now,
    }
    data.tasks.push(task)
    commitment.task_id = task.id
  }

  // The summary is also the discussion note on the task the call came from.
  if (call.task_id) {
    data.activity.push({
      id: uid(),
      task_id: call.task_id,
      user_id: previewUserId,
      content: call.summary,
      created_at: now,
    })
  }

  notify()
  return call
}

function commitmentTaskType(kind: CallCommitment['kind']): TaskType {
  switch (kind) {
    case 'meeting':
    case 'visit':
      return 'meeting'
    case 'order':
      return 'order'
    case 'payment':
    case 'callback':
      return 'call'
    case 'delivery':
      return 'long'
    default:
      return 'general'
  }
}

/**
 * Carries unfinished dated work forward to today. Idempotent: a task already
 * due today or later is left alone, so running it on every load is harmless.
 * Week and month work is never rolled — it is not late until its period ends.
 */
export function runRollover(day: string = todayKey()): number {
  const data = ensure()
  let moved = 0

  for (const task of data.tasks) {
    if (task.status === 'done' || task.horizon !== 'day' || !task.due_date) continue
    const dueKey = toDayKey(task.due_date)
    if (dueKey >= day) continue

    // Keep the time of day it was originally due.
    const originalTime = new Date(task.due_date)
    const hh = `${originalTime.getHours()}`.padStart(2, '0')
    const mm = `${originalTime.getMinutes()}`.padStart(2, '0')

    if (!task.original_due_date) task.original_due_date = dueKey
    task.rollover_count += 1
    task.due_date = combineDayAndTime(day, `${hh}:${mm}`)
    moved += 1
  }

  if (moved > 0) persist()
  return moved
}

export function demoSaveCategory(input: SaveCategoryInput): TaskCategory {
  const data = ensure()
  if (input.id) {
    const existing = data.categories.find((c) => c.id === input.id)
    if (!existing) throw new Error('That work type is no longer here.')
    Object.assign(existing, {
      name: input.name.trim(),
      base_type: input.base_type,
      color: input.color,
      icon: input.icon,
      checklist: input.checklist,
      sop: input.sop?.trim() ? input.sop.trim() : null,
      estimated_minutes: input.estimated_minutes ?? null,
    })
    notify()
    return existing
  }

  const category: TaskCategory = {
    id: uid(),
    name: input.name.trim(),
    base_type: input.base_type,
    color: input.color,
    icon: input.icon,
    checklist: input.checklist,
    sop: input.sop?.trim() ? input.sop.trim() : null,
    estimated_minutes: input.estimated_minutes ?? null,
    active: true,
    created_by: previewUserId,
    created_at: new Date().toISOString(),
  }
  data.categories.push(category)
  notify()
  return category
}

export function demoDeleteCategory(categoryId: string): void {
  const data = ensure()
  const index = data.categories.findIndex((c) => c.id === categoryId)
  if (index === -1) throw new Error('That work type is no longer here.')
  data.categories.splice(index, 1)
  // Existing work keeps its built-in type and simply loses the custom label.
  for (const task of data.tasks) {
    if (task.category_id === categoryId) task.category_id = null
  }
  for (const routine of data.routines) {
    if (routine.category_id === categoryId) routine.category_id = null
  }
  notify()
}

export function demoCurrentUserId(): string {
  ensure()
  return previewUserId
}

export function demoCurrentProfile(): Profile | null {
  const data = ensure()
  return data.profiles.find((p) => p.id === previewUserId) ?? null
}

export function setDemoPreviewUser(id: string): void {
  ensure()
  previewUserId = id
  notify()
}

/** Flip between the owner's view and a representative employee's view. */
export function toggleDemoRole(): void {
  const data = ensure()
  const current = data.profiles.find((p) => p.id === previewUserId)
  if (current?.role === 'admin') {
    previewUserId = DEMO_EMPLOYEE_ID
  } else {
    previewUserId = DEMO_OWNER_ID
  }
  notify()
}

export function resetDemo(): void {
  state = buildDemoDataset()
  previewUserId = DEMO_OWNER_ID
  runRoutineGeneration()
  notify()
}

/* ------------------------------------------------------------------ */
/* Routine generation — mirrors public.generate_routine_tasks() in SQL */
/* ------------------------------------------------------------------ */

/**
 * Idempotent: one task per active routine per working day. Safe to call on
 * every load because it keys off (routine_id, routine_on).
 */
/** The idempotency key for a routine: the start of the period it covers. */
function periodKeyFor(cadence: TaskRoutine['cadence'], day: string): string {
  if (cadence === 'weekly') return startOfWeekKey(day)
  if (cadence === 'monthly') return `${day.slice(0, 7)}-01`
  return day
}

export function runRoutineGeneration(day: string = todayKey()): number {
  const data = ensure()
  if (!isWorkingDay(day)) return 0
  let created = 0

  for (const routine of data.routines) {
    if (!routine.active) continue
    const periodKey = periodKeyFor(routine.cadence, day)
    const already = data.tasks.some((t) => t.routine_id === routine.id && t.routine_on === periodKey)
    if (already) {
      routine.last_generated_on = day
      continue
    }
    const now = new Date().toISOString()
    data.tasks.push({
      id: uid(),
      title: routine.title,
      description: 'Daily routine.',
      status: 'todo',
      assigned_to: routine.assigned_to,
      created_by: routine.created_by,
      due_date: combineDayAndTime(day, routine.due_time),
      is_blocked: false,
      blocked_reason: null,
      blocked_by: null,
      blocked_at: null,
      status_changed_at: now,
      completed_at: null,
      task_type: routine.task_type,
      checklist: routine.checklist.map((c) => ({ ...c, id: uid(), done: false })),
      sop: routine.sop,
      estimated_minutes: routine.estimated_minutes,
      category_id: routine.category_id,
      // A weekly or monthly routine produces work for that whole period.
      horizon: routine.cadence === 'daily' ? 'day' : routine.cadence === 'weekly' ? 'week' : 'month',
      original_due_date: null,
      rollover_count: 0,
      call_log_id: null,
      routine_id: routine.id,
      routine_on: periodKey,
      created_at: now,
    })
    routine.last_generated_on = day
    created += 1
  }

  if (created > 0) persist()
  return created
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export function demoCreateTask(input: CreateTaskInput): Task {
  const data = ensure()
  const now = new Date().toISOString()
  const actor = previewUserId

  if (input.recurrence !== 'once') {
    const routine: TaskRoutine = {
      id: uid(),
      title: input.title,
      task_type: input.task_type,
      assigned_to: input.assigned_to,
      created_by: actor,
      due_time: input.due_time ?? '17:00',
      checklist: input.checklist,
      sop: input.sop?.trim() ? input.sop.trim() : null,
      estimated_minutes: input.estimated_minutes ?? null,
      category_id: input.category_id ?? null,
      cadence: input.recurrence,
      active: true,
      last_generated_on: null,
      created_at: now,
    }
    data.routines.push(routine)
    // Produce today's instance immediately so the work is visible at once.
    const task: Task = {
      id: uid(),
      title: input.title,
      description: input.description ?? 'Daily routine.',
      status: 'todo',
      assigned_to: input.assigned_to,
      created_by: actor,
      due_date: combineDayAndTime(todayKey(), routine.due_time),
      is_blocked: false,
      blocked_reason: null,
      blocked_by: null,
      blocked_at: null,
      status_changed_at: now,
      completed_at: null,
      task_type: input.task_type,
      checklist: input.checklist.map((c) => ({ ...c, id: uid(), done: false })),
      sop: routine.sop,
      estimated_minutes: routine.estimated_minutes,
      category_id: routine.category_id,
      horizon: routine.cadence === 'daily' ? 'day' : routine.cadence === 'weekly' ? 'week' : 'month',
      original_due_date: null,
      rollover_count: 0,
      call_log_id: null,
      routine_id: routine.id,
      routine_on: periodKeyFor(routine.cadence, todayKey()),
      created_at: now,
    }
    routine.last_generated_on = todayKey()
    data.tasks.push(task)
    notify()
    return task
  }

  const task: Task = {
    id: uid(),
    title: input.title,
    description: input.description ?? null,
    status: 'todo',
    assigned_to: input.assigned_to,
    created_by: actor,
    due_date: input.due_date,
    is_blocked: false,
    blocked_reason: null,
    blocked_by: null,
    blocked_at: null,
    status_changed_at: now,
    completed_at: null,
    task_type: input.task_type,
    checklist: input.checklist,
    sop: input.sop?.trim() ? input.sop.trim() : null,
    estimated_minutes: input.estimated_minutes ?? null,
    category_id: input.category_id ?? null,
    horizon: input.horizon ?? 'day',
    original_due_date: null,
    rollover_count: 0,
    call_log_id: input.call_log_id ?? null,
    routine_id: null,
    routine_on: null,
    created_at: now,
  }
  data.tasks.push(task)
  notify()
  return task
}

/**
 * Demo mode mirrors the database rules exactly.
 *
 * If demo mode were more permissive it would hide production defects: a
 * flow that works here would fail the moment Supabase is connected, and the
 * demo is what people test with.
 */
export function demoUpdateTaskStatus(taskId: string, status: TaskStatus): Task {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')

  if (status === 'done' && task.status !== 'done') {
    const total = task.checklist.length
    const done = task.checklist.filter((c) => c.done).length
    if (total > 0 && done < total) {
      throw new Error(`Finish the checklist first — ${total - done} of ${total} steps are still open.`)
    }
    if (task.task_type === 'call') {
      const hasEvidence =
        task.call_log_id !== null ||
        data.calls.some((c) => c.task_id === taskId) ||
        data.activity.some((a) => a.task_id === taskId)
      if (!hasEvidence) throw new Error('Record what was discussed before closing a call.')
    }
  }

  const now = new Date().toISOString()
  const from = task.status
  if (task.status !== status) {
    task.status = status
    task.status_changed_at = now
    task.completed_at = status === 'done' ? now : null
  }
  if (status === 'done') {
    task.is_blocked = false
    task.blocked_reason = null
  }
  recordEvent(task, from === status ? 'status_changed' : status === 'done' ? 'completed' : from === 'done' ? 'reopened' : 'status_changed', from)
  notify()
  return task
}

export function demoSetBlocked(taskId: string, blocked: boolean, reason: string | null = null): Task {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')

  if (blocked && (reason ?? '').trim().length < 10) {
    throw new Error('Say what is blocking this, in at least 10 characters.')
  }

  task.is_blocked = blocked
  task.blocked_reason = blocked ? (reason ?? '').trim() : null
  task.blocked_by = blocked ? previewUserId : null
  task.blocked_at = blocked ? new Date().toISOString() : null
  recordEvent(task, blocked ? 'blocked' : 'unblocked', task.status)
  notify()
  return task
}

/** Only the `done` flag on an existing step, exactly as the RPC allows. */
export function demoSetChecklistItem(taskId: string, itemId: string, done: boolean): Task {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')
  const item = task.checklist.find((c) => c.id === itemId)
  if (!item) throw new Error('That checklist step is not on this task.')
  item.done = done
  recordEvent(task, 'checklist_changed', task.status)
  notify()
  return task
}

/** Append-only, like the database table. Nothing here ever edits an event. */
function recordEvent(task: Task, type: TaskEvent['event_type'], fromStatus: TaskStatus): void {
  const data = ensure()
  const actor = data.profiles.find((p) => p.id === previewUserId) ?? null
  const assignee = task.assigned_to ? (data.profiles.find((p) => p.id === task.assigned_to) ?? null) : null
  data.events.push({
    id: uid(),
    task_id: task.id,
    event_type: type,
    from_status: fromStatus,
    to_status: task.status,
    is_blocked: task.is_blocked,
    blocked_reason: task.blocked_reason,
    actor_id: previewUserId,
    actor_name: actor?.full_name ?? null,
    source: 'details',
    checklist_done: task.checklist.filter((c) => c.done).length,
    checklist_total: task.checklist.length,
    task_title: task.title,
    assignee_id: task.assigned_to,
    assignee_name: assignee?.full_name ?? null,
    due_date: task.due_date,
    occurred_at: new Date().toISOString(),
    occurred_on: todayKey(),
  })
}

export function demoEvents(): TaskEvent[] {
  return [...ensure().events]
}

export function demoAddActivity(taskId: string, content: string): ActivityLog {
  const data = ensure()
  const entry: ActivityLog = {
    id: uid(),
    task_id: taskId,
    user_id: previewUserId,
    content: content.trim(),
    created_at: new Date().toISOString(),
  }
  data.activity.push(entry)
  notify()
  return entry
}

export function demoHandoff(taskId: string, toUserId: string, note: string): TaskHandoff {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')

  const trimmed = note.trim()
  // The same rule the database enforces, repeated here so demo mode behaves
  // identically to a real deployment.
  if (trimmed.length < 10) {
    throw new Error('Please write at least 10 characters explaining why you are passing this on.')
  }
  if (task.assigned_to === toUserId) {
    throw new Error('That person already owns this work.')
  }
  if (!data.profiles.some((p) => p.id === toUserId)) {
    throw new Error('That teammate does not exist.')
  }

  const handoff: TaskHandoff = {
    id: uid(),
    task_id: taskId,
    from_user_id: task.assigned_to,
    to_user_id: toUserId,
    note: trimmed,
    created_at: new Date().toISOString(),
  }
  data.handoffs.push(handoff)
  task.assigned_to = toUserId
  task.is_blocked = false
  data.activity.push({
    id: uid(),
    task_id: taskId,
    user_id: previewUserId,
    content: `Passed this work on. Reason: ${trimmed}`,
    created_at: handoff.created_at,
  })
  notify()
  return handoff
}

export function demoAddEmployee(input: AddEmployeeInput): Profile {
  const data = ensure()
  const profile: Profile = {
    id: uid(),
    role: input.role,
    full_name: input.full_name.trim(),
    job_title: input.job_title.trim(),
    reports_to: input.reports_to,
    created_at: new Date().toISOString(),
  }
  data.profiles.push(profile)
  notify()
  return profile
}

export function demoSetRoutineActive(routineId: string, active: boolean): TaskRoutine {
  const data = ensure()
  const routine = data.routines.find((r) => r.id === routineId)
  if (!routine) throw new Error('That routine is no longer here.')
  routine.active = active
  notify()
  return routine
}

export function demoDeleteRoutine(routineId: string): void {
  const data = ensure()
  const index = data.routines.findIndex((r) => r.id === routineId)
  if (index === -1) throw new Error('That routine is no longer here.')
  data.routines.splice(index, 1)
  notify()
}

export function demoDeleteTask(taskId: string): void {
  const data = ensure()
  const index = data.tasks.findIndex((t) => t.id === taskId)
  if (index === -1) throw new Error('That work is no longer here.')
  data.tasks.splice(index, 1)
  data.activity = data.activity.filter((a) => a.task_id !== taskId)
  data.handoffs = data.handoffs.filter((h) => h.task_id !== taskId)
  notify()
}

export { DEMO_EMPLOYEE_ID, DEMO_OWNER_ID }
