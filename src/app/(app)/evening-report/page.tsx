'use client'

import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CalendarPlus,
  ChevronRight,
  Download,
  MessageSquareOff,
  Mic,
  MicOff,
  Moon,
  Phone,
  PhoneOff,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { StatCard, StatCardSkeleton } from '@/components/shared/stat-card'
import { AdminOnly } from '@/components/shell/role-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivity, useCalls, useHandoffs, useProfiles, useTasks } from '@/lib/data/queries'
import { buildEveningReport, renderReportText } from '@/lib/report'
import type { EveningReport } from '@/lib/types'
import { cn, formatDate, formatFriendlyDay, formatTime, todayKey } from '@/lib/utils'
import { useUIStore } from '@/store/ui'

function shiftDay(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function downloadReport(report: EveningReport): void {
  const text = renderReportText(report)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `flowline-evening-report-${report.date}.txt`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function DatePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const isToday = value === todayKey()
  return (
    <div className="flex items-end gap-2">
      <Button
        variant="glass"
        size="icon"
        onClick={() => onChange(shiftDay(value, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft />
      </Button>
      <div className="space-y-1.5">
        <Label htmlFor="report-date" className="sr-only">
          Report date
        </Label>
        <Input
          id="report-date"
          type="date"
          value={value}
          max={todayKey()}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="w-[168px]"
        />
      </div>
      <Button
        variant="glass"
        size="icon"
        disabled={isToday}
        onClick={() => onChange(shiftDay(value, 1))}
        aria-label="Next day"
      >
        <ChevronRight />
      </Button>
      {!isToday && (
        <Button variant="glass" onClick={() => onChange(todayKey())} className="gap-1.5">
          <CalendarDays />
          Today
        </Button>
      )}
    </div>
  )
}

function EveningReportContent() {
  const [day, setDay] = useState<string>(() => todayKey())
  const openTask = useUIStore((s) => s.openTask)

  const { data: tasks, isLoading: tasksLoading } = useTasks()
  const { data: profiles, isLoading: profilesLoading } = useProfiles()
  const { data: activity, isLoading: activityLoading } = useActivity()
  const { data: handoffs, isLoading: handoffsLoading } = useHandoffs()
  const { data: calls, isLoading: callsLoading } = useCalls()

  const loading = tasksLoading || profilesLoading || activityLoading || handoffsLoading || callsLoading

  const report = useMemo(
    () =>
      buildEveningReport({
        dayKey: day,
        tasks: tasks ?? [],
        profiles: profiles ?? [],
        activity: activity ?? [],
        handoffs: handoffs ?? [],
        callLogs: calls ?? [],
      }),
    [day, tasks, profiles, activity, handoffs, calls],
  )

  const hasAnything = report.totalScheduled > 0 || report.handoffs.length > 0

  return (
    <div className="space-y-7">
      <PageHeader
        title="Evening Report"
        description={`How ${formatFriendlyDay(day).toLowerCase()} actually went — what got finished, what was said on the calls, and what changed hands.`}
        action={
          <Button
            onClick={() => {
              downloadReport(report)
              toast.success('Report downloaded.', { description: `flowline-evening-report-${report.date}.txt` })
            }}
            disabled={loading}
            className="gap-1.5"
          >
            <Download />
            Download report
          </Button>
        }
      />

      <DatePicker value={day} onChange={setDay} />

      {/* Summary */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 stagger sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Work scheduled"
            value={report.totalScheduled}
            icon={CalendarDays}
            hint={`for ${formatFriendlyDay(day).toLowerCase()}`}
          />
          <StatCard
            label="Work completed"
            value={report.completed}
            icon={CheckCircle2}
            tone={report.completionPercent >= 100 ? 'success' : 'primary'}
            percent={report.completionPercent}
            hint={`${report.completionPercent}% of the day closed`}
          />
          <StatCard
            label="Calls"
            value={`${report.callsCompleted}/${report.callsScheduled}`}
            icon={Phone}
            tone={report.callsScheduled === 0 ? 'neutral' : report.allCallsDone ? 'success' : 'warning'}
            hint={
              report.callsScheduled === 0
                ? 'No calls were scheduled'
                : report.allCallsDone
                  ? 'Every call was made'
                  : `${report.callsScheduled - report.callsCompleted} still not made`
            }
          />
          <StatCard
            label="Work passed on"
            value={report.handoffs.length}
            icon={ArrowRightLeft}
            tone={report.handoffs.length > 0 ? 'warning' : 'neutral'}
            hint={report.handoffs.length > 0 ? 'Each one has a written reason' : 'Nobody passed work on'}
          />
        </div>
      )}

      {/* All-calls banner */}
      {!loading && report.callsScheduled > 0 && (
        <div
          className={cn(
            'glass-panel flex items-center gap-3 p-4',
            report.allCallsDone
              ? 'ring-1 ring-inset ring-[color:var(--success)]/25'
              : 'ring-1 ring-inset ring-[color:var(--warning)]/25',
          )}
        >
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              report.allCallsDone
                ? 'bg-[color:var(--success)]/15 text-[color:var(--success)]'
                : 'bg-[color:var(--warning)]/15 text-[color:var(--warning)]',
            )}
          >
            {report.allCallsDone ? <Phone className="h-5 w-5" /> : <PhoneOff className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-[14px] font-semibold text-zinc-900">
              {report.allCallsDone ? 'All calls were completed' : 'Some calls were not made'}
            </p>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">
              {report.allCallsDone
                ? `All ${report.callsScheduled} scheduled calls were made and written up.`
                : `${report.callsScheduled - report.callsCompleted} of ${report.callsScheduled} calls are still open.`}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : !hasAnything ? (
        <EmptyState
          icon={Moon}
          title="Nothing was scheduled for this day"
          description="Pick another date, or assign work from the Assign Work tab and come back this evening."
          className="mt-4"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
          {/* Calls */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-zinc-800">
              <Phone className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
              Calls and what was discussed
            </h2>
            {report.calls.length === 0 ? (
              <EmptyState
                icon={PhoneOff}
                title="No calls scheduled"
                description="Nothing needed a phone call on this day."
              />
            ) : (
              <ul className="space-y-2">
                {report.calls.map((call) => (
                  <li key={call.task.id} className="glass-panel p-4">
                    <button
                      type="button"
                      onClick={() => openTask(call.task.id)}
                      className="flex w-full items-start gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                    >
                      <Badge variant={call.completed ? 'success' : 'danger'} className="mt-0.5 shrink-0">
                        {call.completed ? 'Done' : 'Not done'}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold leading-snug text-zinc-900 text-pretty">
                          {call.task.title}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                          <PersonAvatar profile={call.assignee} className="h-4 w-4" />
                          {call.assignee?.full_name ?? 'Unassigned'}
                          {call.task.due_date && <span>· due {formatTime(call.task.due_date)}</span>}
                        </span>
                      </span>
                    </button>

                    {call.notes.length === 0 ? (
                      <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] text-zinc-400">
                        <MessageSquareOff className="h-3.5 w-3.5" />
                        Nothing was written down about this call.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {call.notes.map((note) => (
                          <li
                            key={note.id}
                            className="border-l-2 border-primary/25 pl-3 text-[12.5px] leading-relaxed text-zinc-600"
                          >
                            {note.content}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recorded calls — the summary, the promises, and what was said
              about us. This is the section the owner actually reads. */}
          <section className="space-y-3 xl:col-span-2 2xl:col-span-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.011em] text-zinc-800">
              <Mic className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
              Calls recorded today
            </h2>
            {report.callLogs.length === 0 ? (
              <EmptyState
                icon={MicOff}
                title="No calls were recorded"
                description="Use “Log call” in the top bar during a call. Flowline writes the summary and schedules whatever was promised."
              />
            ) : (
              <ul className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                {report.callLogs.map(({ call, recorder }) => (
                  <li key={call.id} className="glass-panel space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <PersonAvatar profile={recorder} className="h-6 w-6" />
                      <span className="text-[13.5px] font-semibold text-zinc-900">{call.counterparty}</span>
                      <Badge variant="outline" className="ml-auto">
                        {formatTime(call.created_at)}
                      </Badge>
                      {call.duration_seconds ? (
                        <Badge variant="outline">{Math.round(call.duration_seconds / 60)}m</Badge>
                      ) : null}
                    </div>

                    <p className="text-[13px] leading-relaxed text-zinc-600">{call.summary}</p>

                    {call.commitments.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Promised — now on the calendar
                        </p>
                        <ul className="space-y-1.5">
                          {call.commitments.map((c) => (
                            <li key={c.id} className="flex items-start gap-2 text-[12.5px] text-zinc-600">
                              <CalendarPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>
                                <span className="font-medium text-zinc-800">{c.title}</span>
                                {c.due_date && (
                                  <span className="text-zinc-500">
                                    {' '}
                                    — {formatDate(`${c.due_date}T12:00:00`)}
                                    {c.due_time ? `, ${c.due_time}` : ''}
                                  </span>
                                )}
                                {c.certainty === 'implied' && (
                                  <Badge variant="warning" className="ml-1.5">
                                    worked out
                                  </Badge>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {call.intel.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Said about us
                        </p>
                        <ul className="space-y-1.5">
                          {call.intel.map((i) => (
                            <li
                              key={i.id}
                              className="border-l-2 border-amber-300/70 pl-2.5 text-[12.5px] leading-relaxed text-zinc-600"
                            >
                              <span className="font-medium capitalize text-zinc-700">{i.kind}: </span>
                              {i.note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* People + handoffs */}
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-zinc-800">
                <TrendingUp className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
                Progress by person
              </h2>
              {report.perEmployee.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Nobody had work this day"
                  description="No jobs were scheduled, so there is nothing to measure."
                />
              ) : (
                <ul className="glass-panel divide-y divide-zinc-900/[.06] p-1.5">
                  {report.perEmployee.map((row) => (
                    <li key={row.profile.id} className="flex items-center gap-3 px-3 py-3">
                      <PersonAvatar profile={row.profile} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-zinc-900">{row.profile.full_name}</p>
                        <p className="truncate text-[11.5px] text-zinc-500">{row.profile.job_title ?? 'Team member'}</p>
                        <Progress
                          value={row.percent}
                          complete={row.percent >= 100}
                          className="mt-2 h-1.5"
                          aria-label={`${row.profile.full_name}: ${row.done} of ${row.total} finished`}
                        />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-semibold tabular-nums text-zinc-900">{row.percent}%</p>
                        <p className="text-[11px] tabular-nums text-zinc-400">
                          {row.done}/{row.total}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-zinc-800">
                <ArrowRightLeft className="h-4 w-4 text-zinc-400" strokeWidth={1.9} />
                Work passed to someone else
              </h2>
              {report.handoffs.length === 0 ? (
                <EmptyState
                  icon={ArrowRightLeft}
                  title="Nobody passed work on"
                  description="Every job stayed with the person it was given to."
                />
              ) : (
                <ul className="space-y-2">
                  {report.handoffs.map((entry) => (
                    <li key={entry.handoff.id} className="glass-panel p-4">
                      <button
                        type="button"
                        onClick={() => entry.task && openTask(entry.task.id)}
                        disabled={!entry.task}
                        className="block w-full rounded-lg text-left text-[13.5px] font-semibold leading-snug text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default"
                      >
                        {entry.task?.title ?? 'This task is no longer here'}
                      </button>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="inline-flex items-center gap-1.5">
                          <PersonAvatar profile={entry.from} className="h-5 w-5" />
                          <span className="font-medium text-zinc-700">{entry.from?.full_name ?? 'Someone'}</span>
                        </span>
                        <ArrowRightLeft className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="inline-flex items-center gap-1.5">
                          <PersonAvatar profile={entry.to} className="h-5 w-5" />
                          <span className="font-medium text-zinc-700">{entry.to?.full_name ?? 'Someone'}</span>
                        </span>
                        <Badge variant="outline" className="ml-auto">
                          {formatTime(entry.handoff.created_at)}
                        </Badge>
                      </div>

                      <p className="mt-2.5 border-l-2 border-amber-300/70 pl-3 text-[12.5px] leading-relaxed text-zinc-600">
                        <span className="font-medium text-zinc-700">Reason: </span>
                        {entry.handoff.note}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EveningReportPage() {
  return (
    <AdminOnly
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        </div>
      }
    >
      <EveningReportContent />
    </AdminOnly>
  )
}
