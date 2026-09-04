'use client'

import type { PostgrestError } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/supabase/env'
import * as demo from '@/lib/demo/store'
import type {
  ActivityLog,
  AddEmployeeInput,
  CallCommitment,
  CallIntel,
  CallLog,
  CreateTaskInput,
  Profile,
  SaveCallInput,
  SaveCategoryInput,
  Task,
  TaskCategory,
  TaskHandoff,
  TaskRoutine,
  TaskStatus,
} from '@/lib/types'
import { combineDayAndTime, localTimeZone, todayKey } from '@/lib/utils'

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
export async function fetchCategories(): Promise<TaskCategory[]> {
  if (IS_DEMO) return tick(demo.demoCategories())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_categories')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })
  raise(error)
  return data ?? []
}

export async function saveCategory(input: SaveCategoryInput): Promise<TaskCategory> {
  if (IS_DEMO) return tick(demo.demoSaveCategory(input))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Your session expired. Please sign in again.')

  const row = {
    name: input.name.trim(),
    base_type: input.base_type,
    color: input.color,
    icon: input.icon,
    checklist: input.checklist,
    sop: input.sop?.trim() ? input.sop.trim() : null,
    estimated_minutes: input.estimated_minutes ?? null,
  }

  const query = input.id
    ? supabase.from('task_categories').update(row).eq('id', input.id)
    : supabase.from('task_categories').insert({ ...row, created_by: user.id })

  const { data, error } = await query.select('*').single()
  raise(error)
  if (!data) throw new Error('The work type could not be saved.')
  return data
}

export async function deleteCategory(categoryId: string): Promise<void> {
  if (IS_DEMO) {
    demo.demoDeleteCategory(categoryId)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('task_categories').delete().eq('id', categoryId)
  raise(error)
}

export async function fetchCalls(): Promise<CallLog[]> {
  if (IS_DEMO) return tick(demo.demoCalls())
  const supabase = getBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  raise(error)
  return data ?? []
}

export async function saveCall(input: SaveCallInput): Promise<CallLog> {
  if (IS_DEMO) return tick(demo.demoSaveCall(input))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  // One RPC so the call, its follow-up tasks and the discussion note either
  // all land or none of them do.
  const { data, error } = await supabase.rpc('log_call', {
    p_task_id: input.task_id ?? undefined,
    p_counterparty: input.counterparty.trim(),
    p_duration_seconds: input.duration_seconds ?? undefined,
    p_transcript: input.transcript,
    p_summary: input.summary,
    p_commitments: input.commitments,
    p_intel: input.intel,
    p_assign_to: input.assign_to ?? undefined,
  })
  raise(error)
  if (!data) throw new Error('The call could not be saved.')
  return data
}

export interface CallAnalysis {
  summary: string
  commitments: Array<{
    title: string
    kind: CallCommitment['kind']
    due_date: string | null
    due_time: string | null
    certainty: CallCommitment['certainty']
    quote: string
  }>
  intel: Array<{ kind: CallIntel['kind']; note: string; quote: string }>
  ai: boolean
}

/**
 * True in the static build, which has no server and therefore none of the
 * `/api` routes below.
 *
 * Without this guard `fetch` receives the 404 page, `response.json()` fails
 * on the HTML, and a supervisor is shown a JSON syntax error. A plain sentence
 * is better. The three features affected all need a server-side secret — an
 * Anthropic key or the Supabase service role — so they cannot be moved into
 * the browser even in principle.
 */
const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1'

function needsServer(feature: string): never {
  throw new Error(`${feature} is not available on this address yet — it needs the full Flowline server.`)
}

/** Sends a transcript to be read, summarised and mined for dated promises. */
export async function analyseCall(transcript: string, counterparty: string): Promise<CallAnalysis> {
  if (STATIC_EXPORT) needsServer('Reading a call')
  const response = await fetch('/api/ai/call-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      counterparty,
      today: todayKey(),
      timezone: localTimeZone(),
      weekday: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    }),
  })
  const payload = (await response.json()) as Partial<CallAnalysis> & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? 'The call could not be read.')
  return {
    summary: payload.summary ?? '',
    commitments: payload.commitments ?? [],
    intel: payload.intel ?? [],
    ai: payload.ai ?? false,
  }
}

export interface AiDraft {
  sop: string
  checklist: string[]
  estimated_minutes: number
  /** True when a real model produced this rather than the local fallback. */
  ai: boolean
}

/** Asks the server to draft an SOP and checklist for a job. */
export async function draftWorkPlan(title: string, taskType: string): Promise<AiDraft> {
  if (STATIC_EXPORT) needsServer('Drafting a work plan')
  const response = await fetch('/api/ai/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, task_type: taskType }),
  })
  const payload = (await response.json()) as Partial<AiDraft> & { error?: string }
  if (!response.ok || !payload.sop) {
    throw new Error(payload.error ?? 'The draft could not be written.')
  }
  return {
    sop: payload.sop,
    checklist: payload.checklist ?? [],
    estimated_minutes: payload.estimated_minutes ?? 30,
    ai: payload.ai ?? false,
  }
}

/** Carries yesterday's unfinished work forward. Idempotent. */
export async function rollOverUnfinished(): Promise<number> {
  if (IS_DEMO) return tick(demo.runRollover(), 0)
  const supabase = getBrowserClient()
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('roll_over_unfinished', { p_on: todayKey() })
  if (error) return 0
  return typeof data === 'number' ? data : 0
}

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

  if (input.recurrence !== 'once') {
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
        sop: input.sop ?? null,
        estimated_minutes: input.estimated_minutes ?? null,
        category_id: input.category_id ?? null,
        cadence: input.recurrence,
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
        sop: input.sop ?? null,
        estimated_minutes: input.estimated_minutes ?? null,
        category_id: input.category_id ?? null,
        horizon: input.recurrence === 'weekly' ? 'week' : input.recurrence === 'monthly' ? 'month' : 'day',
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
      sop: input.sop ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      category_id: input.category_id ?? null,
      horizon: input.horizon ?? 'day',
      call_log_id: input.call_log_id ?? null,
    })
    .select('*')
    .single()
  raise(error)
  if (!data) throw new Error('The task could not be created.')
  return data
}

/**
 * Status, blocked state and checklist all go through narrow RPCs now.
 *
 * The database refuses the equivalent direct writes — a broad row update let
 * an employee rewrite checklist labels, block work without a reason, and
 * forge audit timestamps. `source` is carried through so the event log can
 * say the change came from the board rather than "somewhere".
 */
export type ChangeSource = 'details' | 'kanban' | 'api' | 'admin'

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  source: ChangeSource = 'details',
): Promise<Task> {
  if (IS_DEMO) return tick(demo.demoUpdateTaskStatus(taskId, status))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('set_task_status', {
    p_task_id: taskId,
    p_status: status,
    p_source: source,
  })
  raise(error)
  if (!data) throw new Error('That work is no longer here.')
  return data
}

export async function setTaskBlocked(
  taskId: string,
  blocked: boolean,
  reason: string | null = null,
  source: ChangeSource = 'details',
): Promise<Task> {
  if (IS_DEMO) return tick(demo.demoSetBlocked(taskId, blocked, reason))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('set_task_blocked', {
    p_task_id: taskId,
    p_blocked: blocked,
    p_reason: reason ?? undefined,
    p_source: source,
  })
  raise(error)
  if (!data) throw new Error('That work is no longer here.')
  return data
}

/** Ticking one box. The whole array is never writable by a client. */
export async function setChecklistItem(taskId: string, itemId: string, done: boolean): Promise<void> {
  if (IS_DEMO) {
    demo.demoSetChecklistItem(taskId, itemId, done)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('set_checklist_item', {
    p_task_id: taskId,
    p_item_id: itemId,
    p_done: done,
  })
  raise(error)
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
  if (STATIC_EXPORT) needsServer('Adding a teammate')
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
