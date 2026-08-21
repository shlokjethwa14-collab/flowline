'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { subscribeDemo } from '@/lib/demo/store'
import { getBrowserClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/supabase/env'
import type {
  ActivityLog,
  AddEmployeeInput,
  ChecklistItem,
  CreateTaskInput,
  CallLog,
  Profile,
  SaveCallInput,
  SaveCategoryInput,
  Task,
  TaskCategory,
  TaskHandoff,
  TaskRoutine,
  TaskStatus,
} from '@/lib/types'
import * as api from './api'

export const qk = {
  session: ['session'] as const,
  profiles: ['profiles'] as const,
  tasks: ['tasks'] as const,
  activity: ['activity'] as const,
  handoffs: ['handoffs'] as const,
  routines: ['routines'] as const,
  categories: ['categories'] as const,
  calls: ['calls'] as const,
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: api.fetchSession, staleTime: 30_000 })
}

export function useProfiles() {
  return useQuery({ queryKey: qk.profiles, queryFn: api.fetchProfiles, staleTime: 60_000 })
}

export function useTasks() {
  return useQuery({ queryKey: qk.tasks, queryFn: api.fetchTasks, staleTime: 10_000 })
}

export function useActivity() {
  return useQuery({ queryKey: qk.activity, queryFn: api.fetchActivity, staleTime: 10_000 })
}

export function useHandoffs() {
  return useQuery({ queryKey: qk.handoffs, queryFn: api.fetchHandoffs, staleTime: 10_000 })
}

export function useRoutines() {
  return useQuery({ queryKey: qk.routines, queryFn: api.fetchRoutines, staleTime: 30_000 })
}

export function useCalls() {
  return useQuery({ queryKey: qk.calls, queryFn: api.fetchCalls, staleTime: 15_000 })
}

export function useSaveCall() {
  const client = useQueryClient()
  return useMutation<CallLog, Error, SaveCallInput>({
    mutationFn: (input) => api.saveCall(input),
    onSuccess: (call) => {
      const dated = call.commitments.filter((c) => c.due_date).length
      toast.success('Call saved.', {
        description:
          dated > 0
            ? `${dated} follow-up ${dated === 1 ? 'job was' : 'jobs were'} put on the calendar.`
            : 'No dated promises were found, so nothing was scheduled.',
      })
      void client.invalidateQueries({ queryKey: qk.calls })
      void client.invalidateQueries({ queryKey: qk.tasks })
      void client.invalidateQueries({ queryKey: qk.activity })
    },
    onError: (error) => toast.error(api.friendlyError(error)),
  })
}

/** Reads a transcript and pulls out the summary, promises and intel. */
export function useAnalyseCall() {
  return useMutation<api.CallAnalysis, Error, { transcript: string; counterparty: string }>({
    mutationFn: ({ transcript, counterparty }) => api.analyseCall(transcript, counterparty),
    onError: (error) => toast.error(api.friendlyError(error)),
  })
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: api.fetchCategories, staleTime: 60_000 })
}

export function useSaveCategory() {
  const client = useQueryClient()
  return useMutation<TaskCategory, Error, SaveCategoryInput>({
    mutationFn: (input) => api.saveCategory(input),
    onSuccess: (category, input) => {
      toast.success(input.id ? 'Work type updated.' : 'Work type added.', { description: category.name })
      void client.invalidateQueries({ queryKey: qk.categories })
    },
    onError: (error) => toast.error(api.friendlyError(error)),
  })
}

export function useDeleteCategory() {
  const client = useQueryClient()
  return useMutation<void, Error, { categoryId: string }, { previous: TaskCategory[] | undefined }>({
    mutationFn: ({ categoryId }) => api.deleteCategory(categoryId),
    onMutate: async ({ categoryId }) => {
      await client.cancelQueries({ queryKey: qk.categories })
      const previous = client.getQueryData<TaskCategory[]>(qk.categories)
      if (previous) {
        client.setQueryData<TaskCategory[]>(
          qk.categories,
          previous.filter((c) => c.id !== categoryId),
        )
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.categories, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSuccess: () => toast.success('Work type removed.'),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.categories })
      void client.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

/** Asks Claude for an SOP, checklist and time estimate for a job. */
export function useDraftWorkPlan() {
  return useMutation<api.AiDraft, Error, { title: string; taskType: string }>({
    mutationFn: ({ title, taskType }) => api.draftWorkPlan(title, taskType),
    onError: (error) => toast.error(api.friendlyError(error)),
  })
}

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

function invalidateAll(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.tasks })
  void client.invalidateQueries({ queryKey: qk.activity })
  void client.invalidateQueries({ queryKey: qk.handoffs })
  void client.invalidateQueries({ queryKey: qk.routines })
  void client.invalidateQueries({ queryKey: qk.categories })
  void client.invalidateQueries({ queryKey: qk.calls })
  void client.invalidateQueries({ queryKey: qk.profiles })
  void client.invalidateQueries({ queryKey: qk.session })
}

/**
 * Keeps every open screen current. Connected mode listens to Supabase
 * Realtime; demo mode listens to the in-memory store, so both behave the same.
 */
export function useRealtimeSync(): void {
  const client = useQueryClient()

  useEffect(() => {
    if (IS_DEMO) {
      return subscribeDemo(() => invalidateAll(client))
    }

    const supabase = getBrowserClient()
    if (!supabase) return

    const channel = supabase
      .channel('flowline-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void client.invalidateQueries({ queryKey: qk.tasks })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        void client.invalidateQueries({ queryKey: qk.activity })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_handoffs' }, () => {
        void client.invalidateQueries({ queryKey: qk.handoffs })
        void client.invalidateQueries({ queryKey: qk.tasks })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_routines' }, () => {
        void client.invalidateQueries({ queryKey: qk.routines })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void client.invalidateQueries({ queryKey: qk.profiles })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [client])
}

/**
 * Once per app load: materialise the routines due this period, then carry
 * yesterday's unfinished work forward. Both are idempotent, so running them
 * on every load costs nothing and means nobody has to remember to.
 */
export function useDayRollForward(enabled: boolean): void {
  const client = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const generated = await api.generateRoutineTasks()
      const rolled = await api.rollOverUnfinished()
      if (cancelled) return
      if (generated > 0 || rolled > 0) {
        void client.invalidateQueries({ queryKey: qk.tasks })
        void client.invalidateQueries({ queryKey: qk.routines })
      }
      if (rolled > 0) {
        toast.info(`${rolled} unfinished ${rolled === 1 ? 'job was' : 'jobs were'} carried forward to today.`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, enabled])
}

/* ------------------------------------------------------------------ */
/* Mutations — every one is optimistic and rolls back on failure       */
/* ------------------------------------------------------------------ */

function patchTask(client: QueryClient, taskId: string, patch: Partial<Task>): Task[] | undefined {
  const previous = client.getQueryData<Task[]>(qk.tasks)
  if (previous) {
    client.setQueryData<Task[]>(
      qk.tasks,
      previous.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    )
  }
  return previous
}

interface TaskRollback {
  previous: Task[] | undefined
}

export function useUpdateTaskStatus() {
  const client = useQueryClient()
  return useMutation<Task, Error, { taskId: string; status: TaskStatus }, TaskRollback>({
    mutationFn: ({ taskId, status }) => api.updateTaskStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await client.cancelQueries({ queryKey: qk.tasks })
      const now = new Date().toISOString()
      const previous = patchTask(client, taskId, {
        status,
        status_changed_at: now,
        completed_at: status === 'done' ? now : null,
        ...(status === 'done' ? { is_blocked: false } : {}),
      })
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.tasks, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

export function useSetTaskBlocked() {
  const client = useQueryClient()
  return useMutation<Task, Error, { taskId: string; blocked: boolean }, TaskRollback>({
    mutationFn: ({ taskId, blocked }) => api.setTaskBlocked(taskId, blocked),
    onMutate: async ({ taskId, blocked }) => {
      await client.cancelQueries({ queryKey: qk.tasks })
      const previous = patchTask(client, taskId, { is_blocked: blocked })
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.tasks, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

export function useSetChecklist() {
  const client = useQueryClient()
  return useMutation<Task, Error, { taskId: string; checklist: ChecklistItem[] }, TaskRollback>({
    mutationFn: ({ taskId, checklist }) => api.setTaskChecklist(taskId, checklist),
    onMutate: async ({ taskId, checklist }) => {
      await client.cancelQueries({ queryKey: qk.tasks })
      const previous = patchTask(client, taskId, { checklist })
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.tasks, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

export function useCreateTask() {
  const client = useQueryClient()
  return useMutation<Task, Error, CreateTaskInput>({
    mutationFn: (input) => api.createTask(input),
    onSuccess: (task, input) => {
      toast.success(
        input.recurrence === 'once' ? 'Work assigned.' : `${input.recurrence} routine started — the first copy is ready.`,
        { description: task.title },
      )
      void client.invalidateQueries({ queryKey: qk.tasks })
      void client.invalidateQueries({ queryKey: qk.routines })
    },
    onError: (error) => toast.error(api.friendlyError(error)),
  })
}

export function useAddActivity() {
  const client = useQueryClient()
  return useMutation<ActivityLog, Error, { taskId: string; content: string }, { previous: ActivityLog[] | undefined }>({
    mutationFn: ({ taskId, content }) => api.addActivity(taskId, content),
    onMutate: async ({ taskId, content }) => {
      await client.cancelQueries({ queryKey: qk.activity })
      const previous = client.getQueryData<ActivityLog[]>(qk.activity)
      const session = client.getQueryData<api.SessionInfo>(qk.session)
      if (previous) {
        const optimistic: ActivityLog = {
          id: `optimistic-${Date.now()}`,
          task_id: taskId,
          user_id: session?.profile?.id ?? null,
          content: content.trim(),
          created_at: new Date().toISOString(),
        }
        client.setQueryData<ActivityLog[]>(qk.activity, [optimistic, ...previous])
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.activity, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSuccess: () => toast.success('Note saved.'),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.activity })
    },
  })
}

export function useHandoffTask() {
  const client = useQueryClient()
  return useMutation<void, Error, { taskId: string; toUserId: string; note: string }, TaskRollback>({
    mutationFn: ({ taskId, toUserId, note }) => api.handoffTask(taskId, toUserId, note),
    onMutate: async ({ taskId, toUserId }) => {
      await client.cancelQueries({ queryKey: qk.tasks })
      const previous = patchTask(client, taskId, { assigned_to: toUserId, is_blocked: false })
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.tasks, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSuccess: () => toast.success('Work passed on.', { description: 'Your reason was recorded for the evening report.' }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.tasks })
      void client.invalidateQueries({ queryKey: qk.handoffs })
      void client.invalidateQueries({ queryKey: qk.activity })
    },
  })
}

export function useAddEmployee() {
  const client = useQueryClient()
  return useMutation<Profile, Error, AddEmployeeInput>({
    mutationFn: (input) => api.addEmployee(input),
    onSuccess: (profile) => {
      toast.success('Teammate added.', { description: `${profile.full_name} is now on the chart.` })
      void client.invalidateQueries({ queryKey: qk.profiles })
    },
    onError: (error) => toast.error(api.friendlyError(error)),
  })
}

export function useSetRoutineActive() {
  const client = useQueryClient()
  return useMutation<TaskRoutine, Error, { routineId: string; active: boolean }, { previous: TaskRoutine[] | undefined }>(
    {
      mutationFn: ({ routineId, active }) => api.setRoutineActive(routineId, active),
      onMutate: async ({ routineId, active }) => {
        await client.cancelQueries({ queryKey: qk.routines })
        const previous = client.getQueryData<TaskRoutine[]>(qk.routines)
        if (previous) {
          client.setQueryData<TaskRoutine[]>(
            qk.routines,
            previous.map((r) => (r.id === routineId ? { ...r, active } : r)),
          )
        }
        return { previous }
      },
      onError: (error, _vars, context) => {
        if (context?.previous) client.setQueryData(qk.routines, context.previous)
        toast.error(api.friendlyError(error))
      },
      onSuccess: (routine) =>
        toast.success(routine.active ? 'Routine switched on.' : 'Routine paused.', { description: routine.title }),
      onSettled: () => {
        void client.invalidateQueries({ queryKey: qk.routines })
      },
    },
  )
}

export function useDeleteRoutine() {
  const client = useQueryClient()
  return useMutation<void, Error, { routineId: string }, { previous: TaskRoutine[] | undefined }>({
    mutationFn: ({ routineId }) => api.deleteRoutine(routineId),
    onMutate: async ({ routineId }) => {
      await client.cancelQueries({ queryKey: qk.routines })
      const previous = client.getQueryData<TaskRoutine[]>(qk.routines)
      if (previous) {
        client.setQueryData<TaskRoutine[]>(
          qk.routines,
          previous.filter((r) => r.id !== routineId),
        )
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.routines, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSuccess: () => toast.success('Routine removed.'),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.routines })
    },
  })
}

export function useDeleteTask() {
  const client = useQueryClient()
  return useMutation<void, Error, { taskId: string }, TaskRollback>({
    mutationFn: ({ taskId }) => api.deleteTask(taskId),
    onMutate: async ({ taskId }) => {
      await client.cancelQueries({ queryKey: qk.tasks })
      const previous = client.getQueryData<Task[]>(qk.tasks)
      if (previous) {
        client.setQueryData<Task[]>(
          qk.tasks,
          previous.filter((t) => t.id !== taskId),
        )
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.tasks, context.previous)
      toast.error(api.friendlyError(error))
    },
    onSuccess: () => toast.success('Task deleted.'),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

export type { TaskHandoff }
