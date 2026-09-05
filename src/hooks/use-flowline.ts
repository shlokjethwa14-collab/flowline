'use client'

import { useMemo } from 'react'
import { useActivity, useHandoffs, useProfiles, useSession, useTasks } from '@/lib/data/queries'
import type { ActivityLog, Profile, Task, TaskHandoff } from '@/lib/types'

export interface CurrentUser {
  profile: Profile | null
  email: string | null
  isAdmin: boolean
  isDemo: boolean
  isLoading: boolean
}

export function useCurrentUser(): CurrentUser {
  const { data, isLoading } = useSession()
  return {
    profile: data?.profile ?? null,
    email: data?.email ?? null,
    isAdmin: data?.profile?.role === 'admin',
    isDemo: data?.isDemo ?? false,
    isLoading,
  }
}

/** id → profile, for turning foreign keys into names without extra queries. */
export function useProfileMap(): Map<string, Profile> {
  const { data } = useProfiles()
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data])
}

export function useProfileById(id: string | null | undefined): Profile | null {
  const map = useProfileMap()
  if (!id) return null
  return map.get(id) ?? null
}

/**
 * Tasks the signed-in person is allowed to see. Row Level Security already
 * enforces this on the server; repeating it here keeps demo mode honest and
 * means a stale cache can never leak another person's work.
 */
export function useVisibleTasks(): { tasks: Task[]; isLoading: boolean } {
  const { data, isLoading } = useTasks()
  const { profile, isAdmin } = useCurrentUser()

  const tasks = useMemo(() => {
    const all = data ?? []
    if (isAdmin) return all
    if (!profile) return []
    return all.filter((t) => t.assigned_to === profile.id)
  }, [data, isAdmin, profile])

  return { tasks, isLoading }
}

export function useTaskById(taskId: string | null): Task | null {
  const { tasks } = useVisibleTasks()
  return useMemo(() => (taskId ? (tasks.find((t) => t.id === taskId) ?? null) : null), [tasks, taskId])
}

export function useTaskActivity(taskId: string | null): { entries: ActivityLog[]; isLoading: boolean } {
  const { data, isLoading } = useActivity()
  const entries = useMemo(() => {
    if (!taskId) return []
    return (data ?? [])
      .filter((a) => a.task_id === taskId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [data, taskId])
  return { entries, isLoading }
}

export function useTaskHandoffs(taskId: string | null): { entries: TaskHandoff[]; isLoading: boolean } {
  const { data, isLoading } = useHandoffs()
  const entries = useMemo(() => {
    if (!taskId) return []
    return (data ?? [])
      .filter((h) => h.task_id === taskId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [data, taskId])
  return { entries, isLoading }
}

export interface OrgNode {
  profile: Profile
  children: OrgNode[]
  activeCount: number
}

/** Builds the vertical org chart and counts unfinished work per person. */
export function useOrgTree(): { roots: OrgNode[]; orphans: OrgNode[]; isLoading: boolean } {
  const { data: profiles, isLoading: profilesLoading } = useProfiles()
  const { data: tasks, isLoading: tasksLoading } = useTasks()

  return useMemo(() => {
    // Removed people keep their history but leave the chart and every
    // picker — see migration 0016.
    const people = (profiles ?? []).filter((p) => !p.deactivated_at)
    const allTasks = tasks ?? []

    const activeByPerson = new Map<string, number>()
    for (const task of allTasks) {
      if (task.status === 'done' || !task.assigned_to) continue
      activeByPerson.set(task.assigned_to, (activeByPerson.get(task.assigned_to) ?? 0) + 1)
    }

    const nodes = new Map<string, OrgNode>(
      people.map((p) => [p.id, { profile: p, children: [], activeCount: activeByPerson.get(p.id) ?? 0 }]),
    )

    const roots: OrgNode[] = []
    const orphans: OrgNode[] = []

    for (const person of people) {
      const node = nodes.get(person.id)
      if (!node) continue
      if (!person.reports_to) {
        roots.push(node)
        continue
      }
      const parent = nodes.get(person.reports_to)
      if (parent) {
        parent.children.push(node)
      } else {
        // Manager was removed — still show them rather than hiding the person.
        orphans.push(node)
      }
    }

    const sortNodes = (list: OrgNode[]): void => {
      list.sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name))
      for (const n of list) sortNodes(n.children)
    }
    sortNodes(roots)
    sortNodes(orphans)

    return { roots, orphans, isLoading: profilesLoading || tasksLoading }
  }, [profiles, tasks, profilesLoading, tasksLoading])
}
