import type {
  ActivityLog,
  EveningReport,
  EveningReportCall,
  EveningReportHandoff,
  EveningReportRow,
  Profile,
  Task,
  TaskHandoff,
} from './types'
import { formatDate, formatTime, toDayKey } from './utils'

export interface ReportInputs {
  dayKey: string
  tasks: Task[]
  profiles: Profile[]
  activity: ActivityLog[]
  handoffs: TaskHandoff[]
}

/** A task belongs to a day if it was due that day or finished that day. */
function isScheduledOn(task: Task, dayKey: string): boolean {
  if (task.due_date && toDayKey(task.due_date) === dayKey) return true
  if (task.completed_at && toDayKey(task.completed_at) === dayKey) return true
  return false
}

export function buildEveningReport({ dayKey, tasks, profiles, activity, handoffs }: ReportInputs): EveningReport {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const scheduled = tasks.filter((t) => isScheduledOn(t, dayKey))

  const completed = scheduled.filter((t) => t.status === 'done')
  const callTasks = scheduled.filter((t) => t.task_type === 'call')
  const callsCompleted = callTasks.filter((t) => t.status === 'done')

  const calls: EveningReportCall[] = callTasks
    .map((task) => ({
      task,
      assignee: task.assigned_to ? (profileById.get(task.assigned_to) ?? null) : null,
      notes: activity
        .filter((a) => a.task_id === task.id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      completed: task.status === 'done',
    }))
    .sort((a, b) => Number(a.completed) - Number(b.completed))

  // Per-person progress, only for people who actually had work that day.
  const byPerson = new Map<string, { total: number; done: number }>()
  for (const task of scheduled) {
    if (!task.assigned_to) continue
    const entry = byPerson.get(task.assigned_to) ?? { total: 0, done: 0 }
    entry.total += 1
    if (task.status === 'done') entry.done += 1
    byPerson.set(task.assigned_to, entry)
  }

  const perEmployee: EveningReportRow[] = Array.from(byPerson.entries())
    .map(([id, { total, done }]) => {
      const profile = profileById.get(id)
      if (!profile) return null
      return { profile, total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
    })
    .filter((row): row is EveningReportRow => row !== null)
    .sort((a, b) => b.percent - a.percent || a.profile.full_name.localeCompare(b.profile.full_name))

  const dayHandoffs: EveningReportHandoff[] = handoffs
    .filter((h) => toDayKey(h.created_at) === dayKey)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((handoff) => ({
      handoff,
      task: tasks.find((t) => t.id === handoff.task_id) ?? null,
      from: handoff.from_user_id ? (profileById.get(handoff.from_user_id) ?? null) : null,
      to: handoff.to_user_id ? (profileById.get(handoff.to_user_id) ?? null) : null,
    }))

  return {
    date: dayKey,
    totalScheduled: scheduled.length,
    completed: completed.length,
    completionPercent: scheduled.length === 0 ? 0 : Math.round((completed.length / scheduled.length) * 100),
    callsScheduled: callTasks.length,
    callsCompleted: callsCompleted.length,
    allCallsDone: callTasks.length > 0 && callsCompleted.length === callTasks.length,
    calls,
    perEmployee,
    handoffs: dayHandoffs,
  }
}

/** Plain-text report, written so a non-technical reader can just read it. */
export function renderReportText(report: EveningReport): string {
  const lines: string[] = []
  const rule = '='.repeat(64)
  const thin = '-'.repeat(64)

  lines.push(rule)
  lines.push('FLOWLINE — EVENING REPORT')
  lines.push(formatDate(`${report.date}T12:00:00`))
  lines.push(rule)
  lines.push('')

  lines.push('THE DAY IN SHORT')
  lines.push(thin)
  lines.push(`Work scheduled ......... ${report.totalScheduled}`)
  lines.push(`Work completed ......... ${report.completed}`)
  lines.push(`Completion ............. ${report.completionPercent}%`)
  lines.push(`Calls scheduled ........ ${report.callsScheduled}`)
  lines.push(`Calls completed ........ ${report.callsCompleted}`)
  lines.push(
    `All calls done? ........ ${
      report.callsScheduled === 0 ? 'No calls were scheduled' : report.allCallsDone ? 'YES' : 'NO — see below'
    }`,
  )
  lines.push('')

  lines.push('CALLS AND WHAT WAS DISCUSSED')
  lines.push(thin)
  if (report.calls.length === 0) {
    lines.push('No calls were scheduled for this day.')
  } else {
    for (const call of report.calls) {
      lines.push(`${call.completed ? '[DONE]     ' : '[NOT DONE] '}${call.task.title}`)
      lines.push(`            Owner: ${call.assignee?.full_name ?? 'Unassigned'}`)
      if (call.task.due_date) lines.push(`            Due:   ${formatTime(call.task.due_date)}`)
      if (call.notes.length === 0) {
        lines.push('            Discussion: (nothing written down)')
      } else {
        for (const note of call.notes) {
          lines.push(`            Discussion: ${note.content.replace(/\s+/g, ' ').trim()}`)
        }
      }
      lines.push('')
    }
  }

  lines.push('PROGRESS BY PERSON')
  lines.push(thin)
  if (report.perEmployee.length === 0) {
    lines.push('Nobody had work scheduled for this day.')
  } else {
    for (const row of report.perEmployee) {
      const name = `${row.profile.full_name} (${row.profile.job_title ?? 'Team'})`.padEnd(42, '.')
      lines.push(`${name} ${row.done}/${row.total}  ${row.percent}%`)
    }
  }
  lines.push('')

  lines.push('WORK PASSED TO SOMEONE ELSE')
  lines.push(thin)
  if (report.handoffs.length === 0) {
    lines.push('Nobody passed work on today.')
  } else {
    for (const entry of report.handoffs) {
      lines.push(`Task:   ${entry.task?.title ?? 'Task no longer here'}`)
      lines.push(`From:   ${entry.from?.full_name ?? 'Someone'}`)
      lines.push(`To:     ${entry.to?.full_name ?? 'Someone'}`)
      lines.push(`Time:   ${formatTime(entry.handoff.created_at)}`)
      lines.push(`Reason: ${entry.handoff.note.replace(/\s+/g, ' ').trim()}`)
      lines.push('')
    }
  }

  lines.push(rule)
  lines.push(`Generated by Flowline on ${formatDate(new Date())} at ${formatTime(new Date())}.`)
  lines.push(rule)

  return lines.join('\n')
}
