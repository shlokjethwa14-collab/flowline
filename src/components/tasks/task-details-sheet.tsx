'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowRightLeft,
  BookOpen,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  Clock3,
  Gauge,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  Send,
  Timer,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  useCurrentUser,
  useProfileMap,
  useTaskActivity,
  useTaskById,
  useTaskHandoffs,
  useVisibleTasks,
} from '@/hooks/use-flowline'
import {
  useAddActivity,
  useDeleteTask,
  useHandoffTask,
  useProfiles,
  useSetChecklist,
  useSetTaskBlocked,
  useUpdateTaskStatus,
} from '@/lib/data/queries'
import { taskTypeMeta } from '@/lib/task-meta'
import type { Task, WorkOutcome } from '@/lib/types'
import {
  checklistProgress,
  cn,
  currentOwnerMs,
  formatDateTime,
  humanDuration,
  humanMinutes,
  timeAgo,
  totalElapsedMs,
} from '@/lib/utils'
import { handoffSchema, noteSchema, type HandoffValues, type NoteValues } from '@/lib/validators'
import { useUIStore } from '@/store/ui'
import { DueBadge, StatusChip, TaskTypeChip } from './task-badges'

/** Re-renders on a timer so the elapsed counters stay honest. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

const OUTCOMES: Array<{ value: WorkOutcome; label: string; hint: string; icon: typeof PlayCircle; tone: string }> = [
  {
    value: 'continue',
    label: 'Continue working',
    hint: 'Still in hand',
    icon: PlayCircle,
    tone: 'data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700 data-[active=true]:ring-blue-200',
  },
  {
    value: 'review',
    label: 'Ready for review',
    hint: 'Needs a check',
    icon: CheckCheck,
    tone: 'data-[active=true]:bg-violet-50 data-[active=true]:text-violet-700 data-[active=true]:ring-violet-200',
  },
  {
    value: 'blocked',
    label: 'Blocked',
    hint: 'Cannot move',
    icon: CircleAlert,
    tone: 'data-[active=true]:bg-red-50 data-[active=true]:text-red-700 data-[active=true]:ring-red-200',
  },
  {
    value: 'done',
    label: 'Completed by me',
    hint: 'Finished',
    icon: CheckCheck,
    tone: 'data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-700 data-[active=true]:ring-emerald-200',
  },
]

function currentOutcome(task: Task): WorkOutcome {
  if (task.is_blocked) return 'blocked'
  if (task.status === 'done') return 'done'
  if (task.status === 'review') return 'review'
  return 'continue'
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{children}</h3>
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.9} />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</p>
        <div className="mt-0.5 text-[13px] font-medium text-zinc-800">{value}</div>
      </div>
    </div>
  )
}

function TaskSheetBody({ task, onClose }: { task: Task; onClose: () => void }) {
  const now = useNow()
  const { profile, isAdmin } = useCurrentUser()
  const profileMap = useProfileMap()
  const { data: allProfiles } = useProfiles()
  const { entries: activity, isLoading: activityLoading } = useTaskActivity(task.id)
  const { entries: handoffs } = useTaskHandoffs(task.id)

  const updateStatus = useUpdateTaskStatus()
  const setBlocked = useSetTaskBlocked()
  const setChecklist = useSetChecklist()
  const addActivity = useAddActivity()
  const handoff = useHandoffTask()
  const deleteTask = useDeleteTask()

  const [handoffOpen, setHandoffOpen] = useState(false)

  const meta = taskTypeMeta(task.task_type)
  const owner = task.assigned_to ? (profileMap.get(task.assigned_to) ?? null) : null
  const progress = checklistProgress(task.checklist)
  const outcome = currentOutcome(task)
  const isMine = profile?.id === task.assigned_to
  const canAct = isAdmin || isMine

  // Recomputed on every render; the `now` tick is what schedules those renders.
  void now
  const elapsed = humanDuration(totalElapsedMs(task))
  const ownerTime = humanDuration(currentOwnerMs(task, handoffs))

  const noteForm = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { content: '' },
    mode: 'onChange',
  })

  const handoffForm = useForm<HandoffValues>({
    resolver: zodResolver(handoffSchema),
    defaultValues: { to_user_id: '', note: '' },
    mode: 'onChange',
  })

  const handoffCandidates = useMemo(
    () => (allProfiles ?? []).filter((p) => p.id !== task.assigned_to),
    [allProfiles, task.assigned_to],
  )

  function applyOutcome(next: WorkOutcome) {
    if (!canAct) return
    if (next === 'blocked') {
      setBlocked.mutate({ taskId: task.id, blocked: true })
      if (task.status === 'todo') updateStatus.mutate({ taskId: task.id, status: 'in_progress' })
      return
    }
    if (task.is_blocked) setBlocked.mutate({ taskId: task.id, blocked: false })
    const statusFor = { continue: 'in_progress', review: 'review', done: 'done' } as const
    updateStatus.mutate({ taskId: task.id, status: statusFor[next] })
  }

  function toggleChecklistItem(itemId: string, done: boolean) {
    if (!canAct) return
    setChecklist.mutate({
      taskId: task.id,
      checklist: task.checklist.map((c) => (c.id === itemId ? { ...c, done } : c)),
    })
  }

  const onSubmitNote = noteForm.handleSubmit((values) => {
    addActivity.mutate(
      { taskId: task.id, content: values.content },
      { onSuccess: () => noteForm.reset({ content: '' }) },
    )
  })

  const onSubmitHandoff = handoffForm.handleSubmit((values) => {
    handoff.mutate(
      { taskId: task.id, toUserId: values.to_user_id, note: values.note },
      {
        onSuccess: () => {
          handoffForm.reset({ to_user_id: '', note: '' })
          setHandoffOpen(false)
        },
      },
    )
  })

  return (
    <>
      <SheetHeader className="border-b border-zinc-900/[.06]">
        <div className="flex flex-wrap items-center gap-1.5">
          <TaskTypeChip type={task.task_type} />
          <StatusChip status={task.status} />
          {task.is_blocked && (
            <Badge variant="danger">
              <CircleAlert className="h-3 w-3" />
              Blocked
            </Badge>
          )}
          <DueBadge task={task} />
        </div>
        <SheetTitle className="mt-1 text-pretty">{task.title}</SheetTitle>
        <SheetDescription>
          {task.description ? task.description : `${meta.label} · no extra notes were added.`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
        {/* --- Facts ------------------------------------------------- */}
        <section className="glass-panel grid grid-cols-2 gap-4 p-4">
          <MetaRow
            icon={UserRound}
            label="Current owner"
            value={
              <span className="flex items-center gap-1.5">
                <PersonAvatar profile={owner} className="h-5 w-5" />
                <span className="truncate">{owner?.full_name ?? 'Unassigned'}</span>
              </span>
            }
          />
          <MetaRow
            icon={CalendarClock}
            label="Deadline"
            value={task.due_date ? formatDateTime(task.due_date) : 'No deadline'}
          />
          <MetaRow icon={Timer} label="Total time on this" value={elapsed} />
          <MetaRow icon={Clock3} label="With current owner" value={ownerTime} />
          {task.estimated_minutes ? (
            <MetaRow icon={Gauge} label="Expected to take" value={humanMinutes(task.estimated_minutes)} />
          ) : null}
        </section>

        {/* --- Outcome ----------------------------------------------- */}
        {canAct && (
          <section className="space-y-2.5">
            <SectionTitle>What is happening with this work?</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((option) => {
                const Icon = option.icon
                const active = outcome === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => applyOutcome(option.value)}
                    className={cn(
                      'btn-3d flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all',
                      'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      option.tone,
                      active && 'shadow-raised font-medium',
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                    <span className="min-w-0">
                      <span className="block text-[13px] leading-tight">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-400">{option.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* --- SOP ---------------------------------------------------
            Standing instructions, shown to whoever holds the work. This is
            the difference between "do the stock check" and knowing how the
            company expects a stock check to be done. */}
        {task.sop && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle>How this job is done</SectionTitle>
              <Badge variant="primary">
                <BookOpen className="h-3 w-3" />
                Standard procedure
              </Badge>
            </div>
            <div
              className={cn(
                'glass-panel space-y-2 p-4',
                'before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full',
                'before:bg-[linear-gradient(180deg,hsl(250_92%_72%),hsl(250_84%_58%))]',
              )}
            >
              {task.sop.split('\n').map((line, i) =>
                line.trim() ? (
                  <p key={i} className="text-[13.5px] leading-relaxed text-zinc-700">
                    {line}
                  </p>
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* --- Checklist --------------------------------------------- */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <SectionTitle>Evening checklist</SectionTitle>
            <span className="text-[12px] font-medium tabular-nums text-zinc-500">
              {progress.done} of {progress.total} done
            </span>
          </div>
          {progress.total > 0 ? (
            <>
              <Progress value={progress.percent} complete={progress.percent >= 100} className="h-1.5" />
              <ul className="space-y-1">
                {task.checklist.map((item) => (
                  <li key={item.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
                        'hover:bg-white/70',
                        !canAct && 'cursor-default opacity-80',
                      )}
                    >
                      <Checkbox
                        checked={item.done}
                        disabled={!canAct}
                        onCheckedChange={(checked) => toggleChecklistItem(item.id, checked === true)}
                        className="mt-0.5"
                        aria-label={item.label}
                      />
                      <span
                        className={cn(
                          'text-[13.5px] leading-snug text-zinc-700',
                          item.done && 'text-zinc-400 line-through decoration-zinc-300',
                        )}
                      >
                        {item.label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-[12.5px] text-zinc-400">
              No checklist on this one.
            </p>
          )}
        </section>

        <Separator />

        {/* --- Notes ------------------------------------------------- */}
        <section className="space-y-3">
          <SectionTitle>Progress and discussion notes</SectionTitle>

          {canAct && (
            <form onSubmit={onSubmitNote} className="space-y-2">
              <Label htmlFor="task-note" className="sr-only">
                Add a note
              </Label>
              <Textarea
                id="task-note"
                placeholder="What happened? What was discussed? Anything the next person should know…"
                aria-invalid={Boolean(noteForm.formState.errors.content)}
                {...noteForm.register('content')}
                className="min-h-[76px] text-[13.5px]"
              />
              <div className="flex items-center gap-2">
                {noteForm.formState.errors.content && (
                  <p role="alert" className="text-[12px] text-red-600">
                    {noteForm.formState.errors.content.message}
                  </p>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="ml-auto gap-1.5"
                  disabled={addActivity.isPending || !noteForm.formState.isValid}
                >
                  {addActivity.isPending ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}
                  Add note
                </Button>
              </div>
            </form>
          )}

          {activityLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : activity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-5 text-center text-[12.5px] text-zinc-400">
              No notes yet. The first one usually explains what was decided.
            </p>
          ) : (
            <ul className="space-y-2">
              {activity.map((entry) => {
                const author = entry.user_id ? (profileMap.get(entry.user_id) ?? null) : null
                return (
                  <li key={entry.id} className="glass-panel p-3.5">
                    <div className="flex items-center gap-2">
                      <PersonAvatar profile={author} className="h-6 w-6" />
                      <span className="text-[12.5px] font-medium text-zinc-800">{author?.full_name ?? 'Someone'}</span>
                      <span className="ml-auto text-[11.5px] text-zinc-400">{timeAgo(entry.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600">{entry.content}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <Separator />

        {/* --- Handoffs ---------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Handoff history</SectionTitle>
            {canAct && task.status !== 'done' && (
              <Button variant="glass" size="sm" onClick={() => setHandoffOpen((v) => !v)} className="gap-1.5">
                <ArrowRightLeft />
                {handoffOpen ? 'Cancel' : 'Pass to someone'}
              </Button>
            )}
          </div>

          {handoffOpen && canAct && (
            <form onSubmit={onSubmitHandoff} className="glass-panel space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="handoff-to">Who should take this over?</Label>
                <Select
                  value={handoffForm.watch('to_user_id')}
                  onValueChange={(value) =>
                    handoffForm.setValue('to_user_id', value, { shouldValidate: true, shouldDirty: true })
                  }
                >
                  <SelectTrigger
                    id="handoff-to"
                    aria-invalid={Boolean(handoffForm.formState.errors.to_user_id)}
                  >
                    <SelectValue placeholder="Choose a teammate" />
                  </SelectTrigger>
                  <SelectContent>
                    {handoffCandidates.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} · {p.job_title ?? 'Team'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {handoffForm.formState.errors.to_user_id && (
                  <p role="alert" className="text-[12px] text-red-600">
                    {handoffForm.formState.errors.to_user_id.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="handoff-note">
                  Why are you passing it on? <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="handoff-note"
                  placeholder="For example: I am on the pattern approvals all afternoon and cannot stand at the cutting table."
                  aria-invalid={Boolean(handoffForm.formState.errors.note)}
                  aria-describedby="handoff-note-help"
                  {...handoffForm.register('note')}
                  className="min-h-[76px] text-[13.5px]"
                />
                <p id="handoff-note-help" className="text-[11.5px] text-zinc-400">
                  This reason is required and appears in tonight’s evening report.
                </p>
                {handoffForm.formState.errors.note && (
                  <p role="alert" className="text-[12px] text-red-600">
                    {handoffForm.formState.errors.note.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full gap-1.5"
                disabled={handoff.isPending || !handoffForm.formState.isValid}
              >
                {handoff.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Pass the work on
              </Button>
            </form>
          )}

          {handoffs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-5 text-center text-[12.5px] text-zinc-400">
              This work has stayed with one person the whole time.
            </p>
          ) : (
            <ol className="space-y-2">
              {handoffs.map((entry) => {
                const from = entry.from_user_id ? (profileMap.get(entry.from_user_id) ?? null) : null
                const to = entry.to_user_id ? (profileMap.get(entry.to_user_id) ?? null) : null
                return (
                  <li key={entry.id} className="glass-panel p-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <PersonAvatar profile={from} className="h-6 w-6" />
                      <span className="font-medium text-zinc-800">{from?.full_name ?? 'Someone'}</span>
                      <ArrowRightLeft className="h-3.5 w-3.5 text-zinc-400" />
                      <PersonAvatar profile={to} className="h-6 w-6" />
                      <span className="font-medium text-zinc-800">{to?.full_name ?? 'Someone'}</span>
                      <span className="ml-auto text-[11.5px] text-zinc-400">{formatDateTime(entry.created_at)}</span>
                    </div>
                    <p className="mt-2 border-l-2 border-primary/25 pl-3 text-[13px] leading-relaxed text-zinc-600">
                      {entry.note}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* --- Admin-only destructive action -------------------------- */}
        {isAdmin && (
          <>
            <Separator />
            <section className="space-y-2">
              <SectionTitle>Owner controls</SectionTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 hover:border-red-200 hover:bg-red-50"
                disabled={deleteTask.isPending}
                onClick={() => {
                  deleteTask.mutate({ taskId: task.id }, { onSuccess: onClose })
                }}
              >
                {deleteTask.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete this task
              </Button>
            </section>
          </>
        )}
      </div>
    </>
  )
}

export function TaskDetailsSheet() {
  const openTaskId = useUIStore((s) => s.openTaskId)
  const closeTask = useUIStore((s) => s.closeTask)
  const task = useTaskById(openTaskId)
  const { isLoading } = useVisibleTasks()

  // The open task can stop being visible while the sheet is up — it was passed
  // to someone else, or an admin deleted it. Close rather than sit on a
  // skeleton that will never resolve.
  useEffect(() => {
    if (openTaskId && !isLoading && !task) closeTask()
  }, [openTaskId, isLoading, task, closeTask])

  return (
    <Sheet open={Boolean(openTaskId)} onOpenChange={(open) => !open && closeTask()}>
      <SheetContent side="right" className="p-0">
        {task ? (
          <TaskSheetBody task={task} onClose={closeTask} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Loading work…</SheetTitle>
              <SheetDescription>Fetching the details for this task.</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-5 sm:px-6">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
