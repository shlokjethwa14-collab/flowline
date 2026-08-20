'use client'

import type {
  ActivityLog,
  ChecklistItem,
  CreateTaskInput,
  AddEmployeeInput,
  Profile,
  SaveCategoryInput,
  Task,
  TaskCategory,
  TaskHandoff,
  TaskRoutine,
  TaskStatus,
} from '@/lib/types'
import { combineDayAndTime, isWorkingDay, todayKey, uid } from '@/lib/utils'
import { buildDemoDataset, DEMO_EMPLOYEE_ID, DEMO_OWNER_ID, type DemoDataset } from './dataset'

const STORAGE_KEY = 'flowline.demo.v3'
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
export function runRoutineGeneration(day: string = todayKey()): number {
  const data = ensure()
  if (!isWorkingDay(day)) return 0
  let created = 0

  for (const routine of data.routines) {
    if (!routine.active) continue
    const already = data.tasks.some((t) => t.routine_id === routine.id && t.routine_on === day)
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
      status_changed_at: now,
      completed_at: null,
      task_type: routine.task_type,
      checklist: routine.checklist.map((c) => ({ ...c, id: uid(), done: false })),
      sop: routine.sop,
      estimated_minutes: routine.estimated_minutes,
      category_id: routine.category_id,
      routine_id: routine.id,
      routine_on: day,
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

  if (input.recurrence === 'daily') {
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
      status_changed_at: now,
      completed_at: null,
      task_type: input.task_type,
      checklist: input.checklist.map((c) => ({ ...c, id: uid(), done: false })),
      sop: routine.sop,
      estimated_minutes: routine.estimated_minutes,
      category_id: routine.category_id,
      routine_id: routine.id,
      routine_on: todayKey(),
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
    status_changed_at: now,
    completed_at: null,
    task_type: input.task_type,
    checklist: input.checklist,
    sop: input.sop?.trim() ? input.sop.trim() : null,
    estimated_minutes: input.estimated_minutes ?? null,
    category_id: input.category_id ?? null,
    routine_id: null,
    routine_on: null,
    created_at: now,
  }
  data.tasks.push(task)
  notify()
  return task
}

export function demoUpdateTaskStatus(taskId: string, status: TaskStatus): Task {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')
  const now = new Date().toISOString()
  if (task.status !== status) {
    task.status = status
    task.status_changed_at = now
    task.completed_at = status === 'done' ? now : null
  }
  if (status === 'done') task.is_blocked = false
  notify()
  return task
}

export function demoSetBlocked(taskId: string, blocked: boolean): Task {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')
  task.is_blocked = blocked
  notify()
  return task
}

export function demoSetChecklist(taskId: string, checklist: ChecklistItem[]): Task {
  const data = ensure()
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('That work is no longer here.')
  task.checklist = checklist
  notify()
  return task
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
