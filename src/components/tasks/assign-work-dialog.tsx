'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Loader2,
  Plus,
  Repeat,
  Settings2,
  Sparkles,
  Sun,
  Wand2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { CategoryManagerDialog } from '@/components/tasks/category-manager'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useCategories, useCreateTask, useDraftWorkPlan, useProfiles } from '@/lib/data/queries'
import { CATEGORY_ICONS, categoryStyles, checklistTemplate, TASK_TYPES, taskTypeMeta } from '@/lib/task-meta'
import type { TaskCategory, TaskType } from '@/lib/types'
import { cn, combineDayAndTime, humanMinutes, todayKey, uid } from '@/lib/utils'
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
    sop: '',
    estimated_minutes: 0,
    category_id: null,
    horizon: 'day',
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
  const { data: categories } = useCategories()
  const createTask = useCreateTask()
  const draft = useDraftWorkPlan()
  const [sopOpen, setSopOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const form = useForm<CreateTaskValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: defaultValues(assignAssigneeId),
    mode: 'onChange',
  })

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'checklist' })

  const taskType = form.watch('task_type')
  const recurrence = form.watch('recurrence')
  const assignedTo = form.watch('assigned_to')
  const categoryId = form.watch('category_id')
  const horizon = form.watch('horizon') ?? 'day'
  const sopValue = form.watch('sop')
  const estimatedMinutes = Number(form.watch('estimated_minutes')) || 0

  const customTypes = useMemo(() => (categories ?? []).filter((c) => c.active), [categories])

  // Re-arm the form each time the dialog opens, keeping any preselected person.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues(assignAssigneeId))
      setSopOpen(false)
    }
  }, [open, assignAssigneeId, form])

  const assignee = useMemo(
    () => (profiles ?? []).find((p) => p.id === assignedTo) ?? null,
    [profiles, assignedTo],
  )

  function close() {
    closeAssign()
    setQuickAdd(false)
  }

  /** Built-in type: clears any custom category and loads its template. */
  function onTypeChange(next: TaskType) {
    form.setValue('task_type', next, { shouldValidate: true })
    form.setValue('category_id', null)
    replace(checklistTemplate(next))
  }

  /** Custom type: carries its own base type, checklist, SOP and estimate. */
  function onCategoryChange(category: TaskCategory) {
    form.setValue('task_type', category.base_type, { shouldValidate: true })
    form.setValue('category_id', category.id)
    if (category.sop) form.setValue('sop', category.sop)
    if (category.estimated_minutes) form.setValue('estimated_minutes', category.estimated_minutes)
    replace(category.checklist.map((c) => ({ ...c, id: uid(), done: false })))
  }

  function onDraft() {
    const title = form.getValues('title').trim()
    if (title.length < 3) {
      form.setError('title', { message: 'Give the job a name first, then I can draft the steps.' })
      return
    }
    draft.mutate(
      { title, taskType: form.getValues('task_type') },
      {
        onSuccess: (result) => {
          form.setValue('sop', result.sop)
          form.setValue('estimated_minutes', result.estimated_minutes)
          replace(result.checklist.map((label) => ({ id: uid(), label, done: false })))
          setSopOpen(true)
          toast.success(result.ai ? 'Draft written.' : 'Draft prepared from a template.', {
            description: result.ai
              ? 'Read it through and change anything that is not how you work.'
              : 'No AI key is configured, so this came from the built-in template.',
          })
        },
      },
    )
  }

  const onSubmit = form.handleSubmit((values) => {
    const dueIso =
      values.recurrence !== 'once'
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
        sop: values.sop?.trim() ? values.sop.trim() : null,
        estimated_minutes: values.estimated_minutes && values.estimated_minutes > 0 ? values.estimated_minutes : null,
        category_id: values.category_id ?? null,
        horizon: values.recurrence === 'weekly' ? 'week' : values.recurrence === 'monthly' ? 'month' : values.horizon,
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
            <div className="flex gap-2">
              <Input
                id="task-title"
                autoFocus
                placeholder="For example: Call Sunrise Garments about the repeat order"
                aria-invalid={Boolean(form.formState.errors.title)}
                {...form.register('title')}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="glass"
                    size="icon"
                    onClick={onDraft}
                    disabled={draft.isPending}
                    aria-label="Draft the procedure and checklist"
                    className="shrink-0"
                  >
                    {draft.isPending ? <Loader2 className="animate-spin" /> : <Wand2 className="text-primary" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Draft the procedure, checklist and time for me</TooltipContent>
              </Tooltip>
            </div>
            {form.formState.errors.title && (
              <p role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>What kind of work is it?</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setManageOpen(true)}
                className="gap-1.5 text-[12px]"
              >
                <Settings2 className="!size-3.5" />
                Manage types
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TASK_TYPES.map((option) => {
                const Icon = option.icon
                const active = taskType === option.value && !categoryId
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
                        : 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    <span className="text-[12.5px] leading-tight">{option.label}</span>
                  </button>
                )
              })}
            </div>

            {/* The company's own types, sitting alongside the built-ins. */}
            {customTypes.length > 0 && (
              <>
                <p className="pt-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Your work types</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {customTypes.map((category) => {
                    const styles = categoryStyles(category.color)
                    const Icon = CATEGORY_ICONS[category.icon] ?? TASK_TYPES[TASK_TYPES.length - 1].icon
                    const active = categoryId === category.id
                    return (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onCategoryChange(category)}
                        className={cn(
                          'btn-3d flex flex-col items-start gap-1.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? cn(styles.chip, 'shadow-raised font-medium')
                            : 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} />
                        <span className="line-clamp-1 text-[12.5px] leading-tight">{category.name}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {!categoryId && <p className="text-[11.5px] text-zinc-400">{typeMeta.hint}</p>}
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
                    { value: 'weekly', label: 'Every week', icon: CalendarRange },
                    { value: 'monthly', label: 'Every month', icon: CalendarClock },
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
                          : 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
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
                <Label htmlFor="task-date">{recurrence === 'once' ? 'Date' : 'Starts'}</Label>
                <Input
                  id="task-date"
                  type="date"
                  disabled={recurrence !== 'once'}
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

          {recurrence !== 'once' && (
            <p className="flex items-start gap-2 rounded-xl bg-primary/[.06] px-3 py-2.5 text-[12px] leading-relaxed text-primary ring-1 ring-inset ring-primary/15">
              <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {recurrence === 'daily'
                ? 'A fresh copy appears every working day (Monday to Saturday). Today’s copy is created straight away.'
                : recurrence === 'weekly'
                  ? 'A fresh copy appears at the start of each week, and counts as work for that whole week rather than one day.'
                  : 'A fresh copy appears at the start of each month, and counts as work for that whole month.'}
            </p>
          )}

          {/* Horizon — only meaningful for one-off work; repeats set it. */}
          {recurrence === 'once' && (
            <div className="space-y-2">
              <Label>When must it be finished?</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'day', label: 'On the day', hint: 'Due at the time above' },
                    { value: 'week', label: 'This week', hint: 'Any time this week' },
                    { value: 'month', label: 'This month', hint: 'Any time this month' },
                  ] as const
                ).map((option) => {
                  const active = horizon === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => form.setValue('horizon', option.value, { shouldValidate: true })}
                      className={cn(
                        'btn-3d flex flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all',
                        active
                          ? 'bg-primary/10 font-medium text-primary shadow-raised ring-primary/25'
                          : 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
                      )}
                    >
                      <span className="text-[12.5px] leading-tight">{option.label}</span>
                      <span className="text-[10.5px] text-zinc-400">{option.hint}</span>
                    </button>
                  )
                })}
              </div>
              {horizon !== 'day' && (
                <p className="text-[11.5px] text-zinc-400">
                  Period work sits in its own section on My Day and is never carried forward — it is not late until the
                  period ends.
                </p>
              )}
            </div>
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

          {/* How long it should take */}
          <div className="space-y-1.5">
            <Label htmlFor="task-minutes">How long should it take? (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="task-minutes"
                type="number"
                min={0}
                max={1440}
                step={5}
                inputMode="numeric"
                placeholder="45"
                className="w-28"
                aria-describedby="task-minutes-help"
                {...form.register('estimated_minutes')}
              />
              <span id="task-minutes-help" className="text-[12px] text-zinc-500">
                minutes
                {estimatedMinutes > 0 && (
                  <span className="ml-1.5 font-medium text-zinc-700">· {humanMinutes(estimatedMinutes)}</span>
                )}
              </span>
            </div>
            <p className="text-[11.5px] text-zinc-400">
              Shown on the card and on daily routines, so the day can actually be planned.
            </p>
          </div>

          {/* SOP */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-sop" className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
                Standard procedure (optional)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSopOpen((v) => !v)}
                className="text-[12px]"
              >
                {sopOpen ? 'Hide' : sopValue ? 'Show' : 'Add one'}
              </Button>
            </div>
            {sopOpen && (
              <>
                <Textarea
                  id="task-sop"
                  placeholder={'1. Check the register before you start.\n2. Do the work.\n3. Write down what happened.'}
                  className="min-h-[120px] font-mono text-[12.5px] leading-relaxed"
                  {...form.register('sop')}
                />
                <p className="text-[11.5px] text-zinc-400">
                  Whoever holds this job sees these steps inside the task. Use one numbered line per step.
                </p>
              </>
            )}
            {!sopOpen && sopValue && (
              <p className="line-clamp-2 rounded-lg bg-primary/[.06] px-3 py-2 text-[12px] text-zinc-600">
                {sopValue.split('\n')[0]}…
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
              {recurrence === 'once' ? 'Assign work' : `Start ${recurrence} routine`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <CategoryManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </Dialog>
  )
}
