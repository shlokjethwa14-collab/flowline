'use client'

import type { PostgrestError } from '@supabase/supabase-js'
import { ACCOUNT_DOMAIN } from '@/lib/accounts'
import { createIsolatedClient, getBrowserClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/supabase/env'
import * as demo from '@/lib/demo/store'
import type {
  ActivityLog,
  AddEmployeeInput,
  CallCommitment,
  CallIntel,
  CallLog,
  CreateTaskInput,
  Role,
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

/** How long an AI call may take before we stop waiting on it. */
const AI_TIMEOUT_MS = 45_000

/**
 * POSTs to an AI route with a timeout and one retry.
 *
 * Three failure modes are handled distinctly, because they need different
 * words in front of a user:
 *
 *   - **Timeout or network.** Retried once, then reported as something to
 *     try again. These are usually transient.
 *   - **A non-JSON response.** The route does not exist — a static build, or
 *     a bad deploy. Parsing the 404 page as JSON is what produced the
 *     "Unexpected token '<'" a supervisor used to see.
 *   - **A JSON error from the route itself.** Reported verbatim: it was
 *     written for this situation and says more than we could infer.
 *
 * A 4xx is never retried. The request was wrong and will be wrong again.
 */
/** An error a retry cannot help: the request or the deployment is wrong. */
class FinalAiError extends Error {}

async function postAi<T>(path: string, body: unknown, feature: string): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      })

      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new FinalAiError(
          `${feature} is not available here — this deployment has no AI server. An administrator needs to run Flowline on a Node host with ANTHROPIC_API_KEY set.`,
        )
      }

      const payload = (await response.json()) as Record<string, unknown> & { error?: string }

      if (!response.ok) {
        const message = payload.error ?? `${feature} failed.`
        // The server has judged the request; an identical one will not fare better.
        if (response.status < 500) throw new FinalAiError(message)
        lastError = new Error(message)
        continue
      }

      return payload as T
    } catch (error) {
      if (error instanceof FinalAiError) throw error
      const err = error instanceof Error ? error : new Error(String(error))
      lastError = err.name === 'TimeoutError' ? new Error(`${feature} took too long. Try again.`) : err
    }
  }

  throw lastError ?? new Error(`${feature} failed.`)
}

/** Sends a transcript to be read, summarised and mined for dated promises. */
export async function analyseCall(transcript: string, counterparty: string): Promise<CallAnalysis> {
  if (STATIC_EXPORT) needsServer('Reading a call')
  const payload = await postAi<Partial<CallAnalysis>>(
    '/api/ai/call-summary',
    {
      transcript,
      counterparty,
      today: todayKey(),
      timezone: localTimeZone(),
      weekday: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    },
    'Reading the call',
  )
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
  const payload = await postAi<Partial<AiDraft>>(
    '/api/ai/draft',
    { title, task_type: taskType },
    'Drafting the procedure',
  )
  if (!payload.sop) throw new Error('The draft came back empty. Try again, or write the steps yourself.')
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
  if (STATIC_EXPORT) return addEmployeeFromBrowser(input)
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

/**
 * Creating a teammate without a server.
 *
 * The hosted app does this through `/api/team/invite`, which holds the
 * service role key. A static deployment has no server, so that route does not
 * exist — which is why adding anyone failed with "it needs the full Flowline
 * server".
 *
 * With confirmation emails switched off, an ordinary sign-up produces a
 * usable account straight away, so the work can happen here instead. Two
 * details make it safe:
 *
 *   * The sign-up runs on a throwaway client that persists nothing, so the
 *     owner's own session is untouched. On the shared client they would be
 *     silently swapped into the account they had just created.
 *   * The profile is then filled in by the *owner's* client, not the new
 *     one. Role, manager and job title are all guarded by
 *     protect_profile_columns, which only an admin may satisfy — so an
 *     employee cannot promote themselves by repeating this call.
 *
 * The account row itself is written by handle_new_user() the moment the
 * auth user exists; this only completes it.
 */
async function addEmployeeFromBrowser(input: AddEmployeeInput): Promise<Profile> {
  const transient = createIsolatedClient()
  const owner = getBrowserClient()
  if (!transient || !owner) throw new Error('Supabase is not configured.')

  const loginId = input.login_id.trim().toLowerCase()

  const { data: created, error: signUpError } = await transient.auth.signUp({
    email: `${loginId}@${ACCOUNT_DOMAIN}`,
    password: input.password,
    options: { data: { full_name: input.full_name, job_title: input.job_title, login_id: loginId } },
  })

  if (signUpError) {
    const taken = /already|registered|duplicate/i.test(signUpError.message)
    throw new Error(
      taken
        ? `The login ID "${loginId}" is already taken. Choose another.`
        : signUpError.message,
    )
  }

  const userId = created.user?.id
  if (!userId) {
    throw new Error('The account was not created. Check that sign-ups are still enabled for this project.')
  }

  // Sign the throwaway session out so no trace of it is left behind.
  await transient.auth.signOut().catch(() => undefined)

  const { data: profile, error: profileError } = await owner
    .from('profiles')
    .update({
      full_name: input.full_name,
      job_title: input.job_title,
      login_id: loginId,
      reports_to: input.reports_to,
      role: input.role,
    })
    .eq('id', userId)
    .select('*')
    .single()

  if (profileError) throw new Error(profileError.message)
  if (!profile) throw new Error('The account was created but its profile could not be found.')
  return profile
}

/**
 * Takes someone off the team.
 *
 * Deliberately not a delete. Every table that names a person does it with ON
 * DELETE SET NULL, so removing the row would go back through the record and
 * blank who did what — yesterday's report would keep its numbers and lose the
 * names. See migration 0016.
 *
 * Returns how many unfinished jobs moved, so the confirmation can say what
 * actually happened rather than just "done".
 */
export async function removePerson(userId: string, reassignTo: string | null): Promise<number> {
  if (IS_DEMO) return tick(demo.demoRemovePerson(userId, reassignTo))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('deactivate_person', {
    p_user_id: userId,
    p_reassign_to: reassignTo ?? undefined,
  })
  raise(error)
  return data ?? 0
}

export async function restorePerson(userId: string): Promise<void> {
  if (IS_DEMO) {
    demo.demoRestorePerson(userId)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('reactivate_person', { p_user_id: userId })
  raise(error)
}

/**
 * Deletes an account outright. Only succeeds for someone who has done nothing
 * at all — the database refuses the rest, because deleting them would rewrite
 * work that already happened.
 */
export async function deletePersonPermanently(userId: string): Promise<void> {
  if (IS_DEMO) {
    demo.demoDeletePerson(userId)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('delete_person_permanently', { p_user_id: userId })
  raise(error)
}

/**
 * Promotes someone to owner, or puts an owner back to employee.
 *
 * The database refuses to leave a company with no owners, so demoting the
 * last one fails there rather than here — see the trigger in 0013. This is
 * also the prerequisite for removing an owner at all: you cannot remove the
 * only one, so somebody else has to be promoted first.
 */
export async function setPersonRole(userId: string, role: Role): Promise<void> {
  if (IS_DEMO) {
    demo.demoSetPersonRole(userId, role)
    await tick(null)
    return
  }
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('set_person_role', { p_user_id: userId, p_role: role })
  raise(error)
}

/**
 * Updates a person's name and designation.
 *
 * Role is deliberately not settable here: it goes through set_person_role, so
 * the last-owner rule lives in one place and the refusal can name the
 * situation rather than surfacing a constraint.
 */
export async function updatePersonDetails(
  userId: string,
  input: { full_name: string; job_title: string },
): Promise<Profile> {
  if (IS_DEMO) return tick(demo.demoUpdatePerson(userId, input))
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: input.full_name.trim(), job_title: input.job_title.trim() || null })
    .eq('id', userId)
    .select('*')
    .single()
  raise(error)
  if (!data) throw new Error('That person is no longer here.')
  return data
}
