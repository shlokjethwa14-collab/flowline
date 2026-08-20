'use client'

import type { PostgrestError } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/supabase/env'
import * as demo from '@/lib/demo/store'
import type {
  ActivityLog,
  AddEmployeeInput,
  ChecklistItem,
  CreateTaskInput,
  Profile,
  Task,
  TaskHandoff,
  TaskRoutine,
  TaskStatus,
} from '@/lib/types'
import { combineDayAndTime, todayKey } from '@/lib/utils'

/** Small pause in demo mode so skeletons and optimistic updates behave realistically. */
function tick<T>(value: T, ms = 60): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** Turns a database error into something a non-technical person can act on. */
export function friendlyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const message = error.message
    if (message.includes('row-level security') || message.includes('violates row-level')) {
      return 'You do not have permission to do that.'
    }
    if (message.includes('JWT') || message.includes('not signed in')) {
      return 'Your session expired. Please sign in again.'
    }
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return 'Could not reach the server. Check your connection and try again.'
    }
    return message
  }
  const pg = error as Partial<PostgrestError> | null
  if (pg?.message) return pg.message
  return 'Something went wrong. Please try again.'
}

function raise(error: PostgrestError | null): void {
  if (error) throw new Error(error.message)
}

export interface SessionInfo {
  profile: Profile | null
  email: string | null
  isDemo: boolean
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function fetchSession(): Promise<SessionInfo> {
  if (IS_DEMO) {
    return tick({ profile: demo.demoCurrentProfile(), email: null, isDemo: true }, 20)
  }
  const supabase = getBrowserClient()
  if (!supabase) return { profile: null, email: null, isDemo: true }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { profile: null, email: null, isDemo: false }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  raise(error)
  return { profile: data ?? null, email: user.email ?? null, isDemo: false }
}

export async function fetchProfiles(): Promise<Profile[]> {
  if (IS_DEMO) return tick(demo.demoProfiles())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
  raise(error)
  return data ?? []
}

export async function fetchTasks(): Promise<Task[]> {
  if (IS_DEMO) return tick(demo.demoTasks())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
  raise(error)
  return data ?? []
}

export async function fetchActivity(): Promise<ActivityLog[]> {
  if (IS_DEMO) return tick(demo.demoActivity())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  raise(error)
  return data ?? []
}

export async function fetchHandoffs(): Promise<TaskHandoff[]> {
  if (IS_DEMO) return tick(demo.demoHandoffs())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_handoffs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  raise(error)
  return data ?? []
}

export async function fetchRoutines(): Promise<TaskRoutine[]> {
  if (IS_DEMO) return tick(demo.demoRoutines())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('task_routines').select('*').order('due_time', { ascending: true })
  raise(error)
  return data ?? []
}

/**
 * Asks the database to materialise today's routine tasks. The SQL function is
 * idempotent, so calling it on every app load is safe and cheap.
 */
export async function generateRoutineTasks(): Promise<number> {
  if (IS_DEMO) return tick(demo.runRoutineGeneration(), 0)
  const supabase = getBrowserClient()
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('generate_routine_tasks', { p_on: todayKey() })
  if (error) {
    // Employees are not allowed to run this; that is expected, not a failure.
    return 0
  }
  return typeof data === 'number' ? data : 0
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createTask(input: CreateTaskInput): Promise<Task> {
  if (IS_DEMO) return tick(demo.demoCreateTask(input))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Your session expired. Please sign in again.')

  if (input.recurrence === 'daily') {
    const dueTime = input.due_time ?? '17:00'
    const { data: routine, error: routineError } = await supabase
      .from('task_routines')
      .insert({
        title: input.title,
        task_type: input.task_type,
        assigned_to: input.assigned_to,
        created_by: user.id,
        due_time: dueTime,
        checklist: input.checklist,
        active: true,
      })
      .select('*')
      .single()
    raise(routineError)

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: input.title,
        description: input.description ?? 'Daily routine.',
        task_type: input.task_type,
        assigned_to: input.assigned_to,
        created_by: user.id,
        due_date: combineDayAndTime(todayKey(), dueTime),
        checklist: input.checklist,
        routine_id: routine?.id ?? null,
        routine_on: todayKey(),
      })
      .select('*')
      .single()
    raise(taskError)
    if (!task) throw new Error('The task could not be created.')
    return task
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title,
      description: input.description ?? null,
      task_type: input.task_type,
      assigned_to: input.assigned_to,
      created_by: user.id,
      due_date: input.due_date,
      checklist: input.checklist,
    })
    .select('*')
    .single()
  raise(error)
  if (!data) throw new Error('The task could not be created.')
  return data
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  if (IS_DEMO) return tick(demo.demoUpdateTaskStatus(taskId, status))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const patch: { status: TaskStatus; is_blocked?: boolean } = { status }
  if (status === 'done') patch.is_blocked = false
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select('*').single()
  raise(error)
  if (!data) throw new Error('That work is no longer here.')
  return data
}

export async function setTaskBlocked(taskId: string, blocked: boolean): Promise<Task> {
  if (IS_DEMO) return tick(demo.demoSetBlocked(taskId, blocked))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('tasks')
    .update({ is_blocked: blocked })
    .eq('id', taskId)
    .select('*')
    .single()
  raise(error)
  if (!data) throw new Error('That work is no longer here.')
  return data
}

export async function setTaskChecklist(taskId: string, checklist: ChecklistItem[]): Promise<Task> {
  if (IS_DEMO) return tick(demo.demoSetChecklist(taskId, checklist))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('tasks').update({ checklist }).eq('id', taskId).select('*').single()
  raise(error)
  if (!data) throw new Error('That work is no longer here.')
  return data
}

export async function addActivity(taskId: string, content: string): Promise<ActivityLog> {
  if (IS_DEMO) return tick(demo.demoAddActivity(taskId, content))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Your session expired. Please sign in again.')
  const { data, error } = await supabase
    .from('activity_logs')
    .insert({ task_id: taskId, user_id: user.id, content: content.trim() })
    .select('*')
    .single()
  raise(error)
  if (!data) throw new Error('The note could not be saved.')
  return data
}

export async function handoffTask(taskId: string, toUserId: string, note: string): Promise<void> {
  if (IS_DEMO) {
    demo.demoHandoff(taskId, toUserId, note)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  // The reason is validated inside the database function too, so it cannot be
  // skipped by calling the API directly.
  const { error } = await supabase.rpc('handoff_task', {
    p_task_id: taskId,
    p_to_user: toUserId,
    p_note: note.trim(),
  })
  raise(error)
}

export async function addEmployee(input: AddEmployeeInput): Promise<Profile> {
  if (IS_DEMO) return tick(demo.demoAddEmployee(input))
  const response = await fetch('/api/team/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json()) as { profile?: Profile; error?: string }
  if (!response.ok || !payload.profile) {
    throw new Error(payload.error ?? 'The teammate could not be added.')
  }
  return payload.profile
}

export async function setRoutineActive(routineId: string, active: boolean): Promise<TaskRoutine> {
  if (IS_DEMO) return tick(demo.demoSetRoutineActive(routineId, active))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('task_routines')
    .update({ active })
    .eq('id', routineId)
    .select('*')
    .single()
  raise(error)
  if (!data) throw new Error('That routine is no longer here.')
  return data
}

export async function deleteRoutine(routineId: string): Promise<void> {
  if (IS_DEMO) {
    demo.demoDeleteRoutine(routineId)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('task_routines').delete().eq('id', routineId)
  raise(error)
}

export async function deleteTask(taskId: string): Promise<void> {
  if (IS_DEMO) {
    demo.demoDeleteTask(taskId)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  raise(error)
}

export async function signOut(): Promise<void> {
  if (IS_DEMO) return
  const supabase = getBrowserClient()
  if (!supabase) return
  await supabase.auth.signOut()
}
