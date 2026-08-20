'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays, Loader2, Plus, Repeat, Sparkles, Sun, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useCreateTask, useProfiles } from '@/lib/data/queries'
import { checklistTemplate, TASK_TYPES, taskTypeMeta } from '@/lib/task-meta'
import type { TaskType } from '@/lib/types'
import { cn, combineDayAndTime, todayKey, uid } from '@/lib/utils'
import { createTaskSchema, type CreateTaskValues } from '@/lib/validators'
import { useUIStore } from '@/store/ui'

function defaultValues(assigneeId: string | null): CreateTaskValues {
  return {
    title: '',
    description: '',
    task_type: 'general',
    assigned_to: assigneeId ?? '',
    due_date: todayKey(),
    due_time: '17:00',
    recurrence: 'once',
    checklist: checklistTemplate('general'),
  }
}

export function AssignWorkDialog() {
  const assignOpen = useUIStore((s) => s.assignOpen)
  const quickAddOpen = useUIStore((s) => s.quickAddOpen)
  const assignAssigneeId = useUIStore((s) => s.assignAssigneeId)
  const closeAssign = useUIStore((s) => s.closeAssign)
  const setQuickAdd = useUIStore((s) => s.setQuickAdd)

  const open = assignOpen || quickAddOpen
  const { isAdmin } = useCurrentUser()
  const { data: profiles } = useProfiles()
  const createTask = useCreateTask()

  const form = useForm<CreateTaskValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: defaultValues(assignAssigneeId),
    mode: 'onChange',
  })

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'checklist' })

  const taskType = form.watch('task_type')
  const recurrence = form.watch('recurrence')
  const assignedTo = form.watch('assigned_to')

  // Re-arm the form each time the dialog opens, keeping any preselected person.
  useEffect(() => {
    if (open) form.reset(defaultValues(assignAssigneeId))
  }, [open, assignAssigneeId, form])

  const assignee = useMemo(
    () => (profiles ?? []).find((p) => p.id === assignedTo) ?? null,
    [profiles, assignedTo],
  )

  function close() {
    closeAssign()
    setQuickAdd(false)
  }

  function onTypeChange(next: TaskType) {
    form.setValue('task_type', next, { shouldValidate: true })
    // A fresh type brings its own sensible checklist.
    replace(checklistTemplate(next))
  }

  const onSubmit = form.handleSubmit((values) => {
    const dueIso =
      values.recurrence === 'daily'
        ? combineDayAndTime(todayKey(), values.due_time)
        : combineDayAndTime(values.due_date, values.due_time)

    createTask.mutate(
      {
        title: values.title.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        task_type: values.task_type,
        assigned_to: values.assigned_to,
        due_date: dueIso,
        checklist: values.checklist.filter((c) => c.label.trim().length > 0),
        recurrence: values.recurrence,
        due_time: values.due_time,
      },
      { onSuccess: close },
    )
  })

  if (!isAdmin) return null

  const typeMeta = taskTypeMeta(taskType)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Assign work
          </DialogTitle>
          <DialogDescription>
            Give the job a clear name, pick who does it, and Flowline fills in a sensible checklist.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">What needs doing?</Label>
            <Input
              id="task-title"
              autoFocus
              placeholder="For example: Call Sunrise Garments about the repeat order"
              aria-invalid={Boolean(form.formState.errors.title)}
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>What kind of work is it?</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TASK_TYPES.map((option) => {
                const Icon = option.icon
                const active = taskType === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onTypeChange(option.value)}
                    className={cn(
                      'btn-3d flex flex-col items-start gap-1.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? cn(option.chip, 'shadow-raised font-medium')
                        : 'bg-white/70 text-zinc-600 ring-zinc-200/80 hover:bg-white',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    <span className="text-[12.5px] leading-tight">{option.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11.5px] text-zinc-400">{typeMeta.hint}</p>
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Who is doing it?</Label>
            <Select
              value={assignedTo}
              onValueChange={(value) => form.setValue('assigned_to', value, { shouldValidate: true })}
            >
              <SelectTrigger id="task-assignee" aria-invalid={Boolean(form.formState.errors.assigned_to)}>
                <SelectValue placeholder="Choose a teammate" />
              </SelectTrigger>
              <SelectContent>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} · {p.job_title ?? 'Team'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignee && (
              <div className="flex items-center gap-2 pt-1">
                <PersonAvatar profile={assignee} className="h-6 w-6" />
                <span className="text-[12px] text-zinc-500">
                  Goes to {assignee.full_name}, {assignee.job_title ?? 'team member'}
                </span>
              </div>
            )}
            {form.formState.errors.assigned_to && (
              <p role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.assigned_to.message}
              </p>
            )}
          </div>

          {/* Recurrence + deadline */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>How often?</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'once', label: 'Only once', icon: CalendarDays },
                    { value: 'daily', label: 'Every day', icon: Repeat },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon
                  const active = recurrence === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => form.setValue('recurrence', option.value, { shouldValidate: true })}
                      className={cn(
                        'btn-3d flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] ring-1 ring-inset transition-all',
                        active
                          ? 'bg-primary/10 font-medium text-primary shadow-raised ring-primary/25'
                          : 'bg-white/70 text-zinc-600 ring-zinc-200/80 hover:bg-white',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-date">{recurrence === 'daily' ? 'Starts' : 'Date'}</Label>
                <Input
                  id="task-date"
                  type="date"
                  disabled={recurrence === 'daily'}
                  aria-invalid={Boolean(form.formState.errors.due_date)}
                  {...form.register('due_date')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-time">Due by</Label>
                <Input
                  id="task-time"
                  type="time"
                  aria-invalid={Boolean(form.formState.errors.due_time)}
                  {...form.register('due_time')}
                />
              </div>
            </div>
          </div>

          {recurrence === 'daily' && (
            <p className="flex items-start gap-2 rounded-xl bg-primary/[.06] px-3 py-2.5 text-[12px] leading-relaxed text-primary ring-1 ring-inset ring-primary/15">
              <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A fresh copy of this task appears every working day (Monday to Saturday). Today’s copy is created straight
              away.
            </p>
          )}

          {/* Checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Evening checklist</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => append({ id: uid(), label: '', done: false })}
                disabled={fields.length >= 12}
                className="gap-1.5"
              >
                <Plus />
                Add step
              </Button>
            </div>
            <ul className="space-y-2">
              {fields.map((field, index) => (
                <li key={field.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[12px] font-medium tabular-nums text-zinc-400">
                    {index + 1}
                  </span>
                  <Input
                    aria-label={`Checklist step ${index + 1}`}
                    placeholder="What has to happen?"
                    className="h-9 text-[13px]"
                    {...form.register(`checklist.${index}.label` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(index)}
                    aria-label={`Remove step ${index + 1}`}
                    className="shrink-0 text-zinc-400 hover:text-red-600"
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            {fields.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-[12.5px] text-zinc-400">
                No steps. Add one, or leave it and the person will just mark the task done.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Anything else they should know? (optional)</Label>
            <Textarea
              id="task-description"
              placeholder="Background, contact numbers, quantities…"
              className="min-h-[72px] text-[13.5px]"
              {...form.register('description')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="glass" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending} className="gap-1.5">
              {createTask.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {recurrence === 'daily' ? 'Start daily routine' : 'Assign work'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
