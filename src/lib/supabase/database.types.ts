/**
 * Hand-maintained mirror of `supabase/schema.sql`. Keeping this in the repo
 * (rather than only generating it) means `npm run typecheck` catches schema
 * drift without needing a live database.
 *
 * Regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 */

import type { ChecklistItem, Role, TaskStatus, TaskType } from '@/lib/types'

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
          reports_to: string | null
          created_at: string
        }
        Insert: {
          id: string
          role?: Role
          full_name?: string
          job_title?: string | null
          reports_to?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: Role
          full_name?: string
          job_title?: string | null
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
          status_changed_at: string
          completed_at: string | null
          task_type: TaskType
          checklist: ChecklistItem[]
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
          status_changed_at?: string
          completed_at?: string | null
          task_type?: TaskType
          checklist?: ChecklistItem[]
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
          status_changed_at?: string
          completed_at?: string | null
          task_type?: TaskType
          checklist?: ChecklistItem[]
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
          active?: boolean
          last_generated_on?: string | null
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
      is_admin: {
        Args: Record<string, never>
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
