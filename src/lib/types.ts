/**
 * Domain types. These mirror the PostgreSQL schema in `supabase/schema.sql`
 * one-to-one so the demo store and the Supabase client speak the same language.
 */

export type Role = 'admin' | 'employee'

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

export type TaskType = 'general' | 'call' | 'order' | 'entry' | 'long' | 'meeting' | 'growth'

export type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly'

/**
 * How long the person has to finish something. A `day` job is due today; a
 * `week` or `month` job is a commitment for the period, shown separately so
 * it does not compete with today's list.
 */
export type Horizon = 'day' | 'week' | 'month'

/** What kind of promise was made on a call. */
export type CommitmentKind = 'meeting' | 'order' | 'payment' | 'delivery' | 'callback' | 'visit' | 'other'

/**
 * A dated promise pulled out of a call. `quote` is the line it came from, so
 * nobody has to trust the extraction blindly — the owner can check it.
 */
export interface CallCommitment {
  id: string
  title: string
  kind: CommitmentKind
  /** YYYY-MM-DD. Null when a date was implied but could not be pinned down. */
  due_date: string | null
  /** 'HH:MM' when the call named a time. */
  due_time: string | null
  /** How plainly it was said: stated outright, or inferred from context. */
  certainty: 'stated' | 'implied'
  quote: string
  /** Set once this commitment has been turned into real work. */
  task_id: string | null
}

/** Anything else worth knowing that was not a dated promise. */
export interface CallIntel {
  id: string
  kind: 'complaint' | 'praise' | 'competitor' | 'price' | 'risk' | 'opportunity' | 'other'
  note: string
  quote: string
}

export interface CallLog {
  id: string
  /** The task this call belongs to, when it was made from one. */
  task_id: string | null
  /** Who was on the other end, as typed by the person who made the call. */
  counterparty: string
  recorded_by: string | null
  /** Seconds of audio, when it was recorded rather than typed. */
  duration_seconds: number | null
  transcript: string
  summary: string
  commitments: CallCommitment[]
  intel: CallIntel[]
  created_at: string
}

/** What the person doing the work says happened. Maps onto status + blocked. */
export type WorkOutcome = 'continue' | 'review' | 'blocked' | 'done'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface Profile {
  id: string
  role: Role
  full_name: string
  job_title: string | null
  reports_to: string | null
  created_at: string
}

/**
 * A work type the company defined for itself, on top of the seven built-ins.
 * `base_type` keeps it grouped correctly on My Day and in the evening report —
 * a custom "Factory visit" that behaves like a meeting still lands under
 * Meetings without every consumer needing to know it exists.
 */
export interface TaskCategory {
  id: string
  name: string
  base_type: TaskType
  /** Key into the fixed palette in task-meta.ts. */
  color: string
  /** Key into the fixed icon set in task-meta.ts. */
  icon: string
  checklist: ChecklistItem[]
  /** Default SOP copied onto every task made from this category. */
  sop: string | null
  estimated_minutes: number | null
  active: boolean
  created_by: string | null
  created_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  assigned_to: string | null
  created_by: string | null
  due_date: string | null
  is_blocked: boolean
  status_changed_at: string
  completed_at: string | null
  task_type: TaskType
  checklist: ChecklistItem[]
  /** Standing instructions for how this job is done properly. */
  sop: string | null
  /** How long this work is expected to take, in minutes. */
  estimated_minutes: number | null
  category_id: string | null
  /** Day, week or month job. Week and month work sits apart from today. */
  horizon: Horizon
  /** The day it was originally due, before any carry-forward. */
  original_due_date: string | null
  /** How many days it has been carried forward unfinished. */
  rollover_count: number
  /** Set when this task was created from a promise made on a call. */
  call_log_id: string | null
  routine_id: string | null
  routine_on: string | null
  created_at: string
}

export interface ActivityLog {
  id: string
  task_id: string
  user_id: string | null
  content: string
  created_at: string
}

export interface TaskHandoff {
  id: string
  task_id: string
  from_user_id: string | null
  to_user_id: string | null
  note: string
  created_at: string
}

export interface TaskRoutine {
  id: string
  title: string
  task_type: TaskType
  assigned_to: string | null
  created_by: string | null
  /** 'HH:MM' local wall-clock time the generated task is due. */
  due_time: string
  checklist: ChecklistItem[]
  sop: string | null
  /** Shown on Assign Work so the day can actually be planned. */
  estimated_minutes: number | null
  category_id: string | null
  /** How often a fresh copy appears: every working day, week, or month. */
  cadence: Exclude<Recurrence, 'once'>
  active: boolean
  last_generated_on: string | null
  created_at: string
}

/** Payload accepted by the Assign Work dialog and Quick Add. */
export interface CreateTaskInput {
  title: string
  description?: string | null
  task_type: TaskType
  assigned_to: string
  due_date: string | null
  checklist: ChecklistItem[]
  recurrence: Recurrence
  /** 'HH:MM' — only used when recurrence is 'daily'. */
  due_time?: string
  sop?: string | null
  estimated_minutes?: number | null
  category_id?: string | null
  horizon?: Horizon
  call_log_id?: string | null
}

export interface SaveCallInput {
  task_id?: string | null
  counterparty: string
  duration_seconds?: number | null
  transcript: string
  summary: string
  commitments: CallCommitment[]
  intel: CallIntel[]
  /** Who the follow-up work goes to. Defaults to whoever logged the call. */
  assign_to?: string | null
}

export interface SaveCategoryInput {
  /** Present when editing an existing work type. */
  id?: string
  name: string
  base_type: TaskType
  color: string
  icon: string
  checklist: ChecklistItem[]
  sop?: string | null
  estimated_minutes?: number | null
}

export interface AddEmployeeInput {
  full_name: string
  job_title: string
  email?: string | null
  reports_to: string | null
  role: Role
}

/** A task joined with the people attached to it, ready to render. */
export interface TaskWithPeople extends Task {
  assignee: Profile | null
  creator: Profile | null
}

export interface EveningReportRow {
  profile: Profile
  total: number
  done: number
  percent: number
}

export interface EveningReportCall {
  task: Task
  assignee: Profile | null
  notes: ActivityLog[]
  completed: boolean
}

export interface EveningReportHandoff {
  handoff: TaskHandoff
  task: Task | null
  from: Profile | null
  to: Profile | null
}

export interface EveningReportCallLog {
  call: CallLog
  recorder: Profile | null
}

export interface EveningReport {
  date: string
  /** Calls recorded today, with their summaries, promises and intel. */
  callLogs: EveningReportCallLog[]
  /** Jobs still open that have already been carried forward at least once. */
  rolledOver: number
  totalScheduled: number
  completed: number
  completionPercent: number
  callsScheduled: number
  callsCompleted: number
  allCallsDone: boolean
  calls: EveningReportCall[]
  perEmployee: EveningReportRow[]
  handoffs: EveningReportHandoff[]
}
