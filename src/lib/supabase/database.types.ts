/**
 * Hand-maintained mirror of `supabase/schema.sql`. Keeping this in the repo
 * (rather than only generating it) means `npm run typecheck` catches schema
 * drift without needing a live database.
 *
 * Regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 */

import type {
  CallCommitment,
  CallIntel,
  ChecklistItem,
  Horizon,
  Role,
  TaskEvent,
  TaskStatus,
  TaskType,
} from '@/lib/types'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: Role
          full_name: string
          job_title: string | null
          /** What the person types to sign in. Null on rows predating 0014. */
          login_id: string | null
          reports_to: string | null
          created_at: string
        }
        Insert: {
          id: string
          role?: Role
          full_name?: string
          job_title?: string | null
          login_id?: string | null
          reports_to?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: Role
          full_name?: string
          job_title?: string | null
          login_id?: string | null
          reports_to?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          status: TaskStatus
          assigned_to: string | null
          created_by: string | null
          due_date: string | null
          is_blocked: boolean
          blocked_reason: string | null
          blocked_by: string | null
          blocked_at: string | null
          status_changed_at: string
          completed_at: string | null
          task_type: TaskType
          checklist: ChecklistItem[]
          sop: string | null
          estimated_minutes: number | null
          category_id: string | null
          horizon: Horizon
          original_due_date: string | null
          rollover_count: number
          call_log_id: string | null
          routine_id: string | null
          routine_on: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          status?: TaskStatus
          assigned_to?: string | null
          created_by?: string | null
          due_date?: string | null
          is_blocked?: boolean
          blocked_reason?: string | null
          blocked_by?: string | null
          blocked_at?: string | null
          status_changed_at?: string
          completed_at?: string | null
          task_type?: TaskType
          checklist?: ChecklistItem[]
          sop?: string | null
          estimated_minutes?: number | null
          category_id?: string | null
          horizon?: Horizon
          original_due_date?: string | null
          rollover_count?: number
          call_log_id?: string | null
          routine_id?: string | null
          routine_on?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          status?: TaskStatus
          assigned_to?: string | null
          created_by?: string | null
          due_date?: string | null
          is_blocked?: boolean
          blocked_reason?: string | null
          blocked_by?: string | null
          blocked_at?: string | null
          status_changed_at?: string
          completed_at?: string | null
          task_type?: TaskType
          checklist?: ChecklistItem[]
          sop?: string | null
          estimated_minutes?: number | null
          category_id?: string | null
          horizon?: Horizon
          original_due_date?: string | null
          rollover_count?: number
          call_log_id?: string | null
          routine_id?: string | null
          routine_on?: string | null
          created_at?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          id: string
          task_id: string
          user_id: string | null
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id?: string | null
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string | null
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      task_handoffs: {
        Row: {
          id: string
          task_id: string
          from_user_id: string | null
          to_user_id: string | null
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          from_user_id?: string | null
          to_user_id?: string | null
          note: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          from_user_id?: string | null
          to_user_id?: string | null
          note?: string
          created_at?: string
        }
        Relationships: []
      }
      task_routines: {
        Row: {
          id: string
          title: string
          task_type: TaskType
          assigned_to: string | null
          created_by: string | null
          due_time: string
          checklist: ChecklistItem[]
          sop: string | null
          estimated_minutes: number | null
          category_id: string | null
          cadence: 'daily' | 'weekly' | 'monthly'
          active: boolean
          last_generated_on: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          task_type?: TaskType
          assigned_to?: string | null
          created_by?: string | null
          due_time?: string
          checklist?: ChecklistItem[]
          sop?: string | null
          estimated_minutes?: number | null
          category_id?: string | null
          cadence?: 'daily' | 'weekly' | 'monthly'
          active?: boolean
          last_generated_on?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          task_type?: TaskType
          assigned_to?: string | null
          created_by?: string | null
          due_time?: string
          checklist?: ChecklistItem[]
          sop?: string | null
          estimated_minutes?: number | null
          category_id?: string | null
          cadence?: 'daily' | 'weekly' | 'monthly'
          active?: boolean
          last_generated_on?: string | null
          created_at?: string
        }
        Relationships: []
      }
      task_events: {
        Row: {
          id: number
          task_id: string
          event_type: TaskEvent['event_type']
          from_status: TaskStatus | null
          to_status: TaskStatus | null
          is_blocked: boolean | null
          blocked_reason: string | null
          actor_id: string | null
          actor_name: string | null
          source: TaskEvent['source']
          checklist_done: number | null
          checklist_total: number | null
          task_title: string | null
          assignee_id: string | null
          assignee_name: string | null
          due_date: string | null
          occurred_at: string
          occurred_on: string
          meta: Json
        }
        /* Append-only: rows are written by SECURITY DEFINER triggers, never
           by a client, so Insert/Update are intentionally never-typed. */
        Insert: never
        Update: never
        Relationships: []
      }
      org_settings: {
        Row: { id: boolean; timezone: string; working_days: number[]; created_at: string }
        Insert: { id?: boolean; timezone?: string; working_days?: number[]; created_at?: string }
        Update: { id?: boolean; timezone?: string; working_days?: number[]; created_at?: string }
        Relationships: []
      }
      call_logs: {
        Row: {
          id: string
          task_id: string | null
          counterparty: string
          recorded_by: string | null
          duration_seconds: number | null
          transcript: string
          summary: string
          commitments: CallCommitment[]
          intel: CallIntel[]
          created_at: string
        }
        Insert: {
          id?: string
          task_id?: string | null
          counterparty: string
          recorded_by?: string | null
          duration_seconds?: number | null
          transcript: string
          summary?: string
          commitments?: CallCommitment[]
          intel?: CallIntel[]
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string | null
          counterparty?: string
          recorded_by?: string | null
          duration_seconds?: number | null
          transcript?: string
          summary?: string
          commitments?: CallCommitment[]
          intel?: CallIntel[]
          created_at?: string
        }
        Relationships: []
      }
      task_categories: {
        Row: {
          id: string
          name: string
          base_type: TaskType
          color: string
          icon: string
          checklist: ChecklistItem[]
          sop: string | null
          estimated_minutes: number | null
          active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          base_type?: TaskType
          color?: string
          icon?: string
          checklist?: ChecklistItem[]
          sop?: string | null
          estimated_minutes?: number | null
          active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          base_type?: TaskType
          color?: string
          icon?: string
          checklist?: ChecklistItem[]
          sop?: string | null
          estimated_minutes?: number | null
          active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      handoff_task: {
        Args: { p_task_id: string; p_to_user: string; p_note: string }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
      generate_routine_tasks: {
        Args: { p_on?: string }
        Returns: number
      }
      roll_over_unfinished: {
        Args: { p_on?: string }
        Returns: number
      }
      log_call: {
        Args: {
          p_task_id?: string
          p_counterparty: string
          p_duration_seconds?: number
          p_transcript: string
          p_summary: string
          p_commitments: CallCommitment[]
          p_intel: CallIntel[]
          p_assign_to?: string
        }
        Returns: Database['public']['Tables']['call_logs']['Row']
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      set_task_status: {
        Args: { p_task_id: string; p_status: TaskStatus; p_source?: string }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
      set_task_blocked: {
        Args: { p_task_id: string; p_blocked: boolean; p_reason?: string; p_source?: string }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
      set_checklist_item: {
        Args: { p_task_id: string; p_item_id: string; p_done: boolean }
        Returns: boolean
      }
      org_today: {
        Args: Record<string, never>
        Returns: string
      }
      org_timezone: {
        Args: Record<string, never>
        Returns: string
      }
      /** True only while no profile exists — the one-time owner claim gate. */
      /** Resolves a login ID to the address its account uses. Never null-signals. */
      login_email: {
        Args: { p_identifier: string }
        Returns: string | null
      }
      workspace_is_unclaimed: {
        Args: Record<string, never>
        Returns: boolean
      }
      set_person_role: {
        Args: { p_user_id: string; p_role: Role }
        Returns: void
      }
      /** Owners may read anyone's; everyone else only their own. */
      email_for: {
        Args: { p_user_id: string }
        Returns: string | null
      }
      email_is_verified: {
        Args: { p_user_id?: string | null }
        Returns: boolean
      }
    }
    Enums: {
      user_role: Role
      task_status: TaskStatus
      task_type: TaskType
    }
    CompositeTypes: Record<never, never>
  }
}
