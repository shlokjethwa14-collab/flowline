/**
 * Domain types. These mirror the PostgreSQL schema in `supabase/schema.sql`
 * one-to-one so the demo store and the Supabase client speak the same language.
 */

export type Role = 'admin' | 'employee'

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

export type TaskType = 'general' | 'call' | 'order' | 'entry' | 'long' | 'meeting' | 'growth'

export type Recurrence = 'once' | 'daily'

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

export interface EveningReport {
  date: string
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
